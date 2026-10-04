import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { claimGroups, claimNumbers, parseClient } from '../src/claim-groups.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 10/04/2026: "the same customer / claim is currently being assigned several cards.
// consolidate the cards and list all open tasks for that claim under the same card."
// The client lines below are the ones Aries actually wrote on the live board that day.

/** @param {number} id @param {string} client @param {string} [claim] @param {string} [status] */
function card(id, client, claim = '', status = 'open') {
  return { id, title: `Card ${id}`, status, brief: { client, claim } }
}

/** @param {Map<number, {key: string}>} groups */
function together(groups, ...ids) {
  const keys = ids.map((id) => groups.get(id)?.key)
  return keys.every((key) => key && key === keys[0])
}

test('the same invoice number is one claim, however the client is written', () => {
  const groups = claimGroups([
    card(4001, 'Linda Pickering', 'Invoice 115224'),
    card(4137, 'Pickering, Linda & Orlowski, Lynn', 'Invoice 115224'),
    card(3971, 'Victor Yoo', 'USAA 021792489-801'),
    card(3972, '', '021792489801'),
  ])
  assert.ok(together(groups, 4001, 4137))
  assert.ok(together(groups, 3971, 3972), 'carrier prefix and dashes do not split a claim number')
  assert.equal(groups.get(4001)?.label, 'Pickering, Linda & Orlowski, Lynn', 'a tie goes to the line naming both owners')
})

test('one client written several ways is one claim', () => {
  const groups = claimGroups([
    card(4132, 'Robert and Elizabeth Badgett'),
    card(4190, 'Robert Badgett'),
    card(4013, 'Commander Robert (Bruce) Badgett and Elizabeth Badgett'),
    card(4014, 'Robert Badgett & Elizabeth Badgett'),
    card(4126, 'Tom Williams'),
    card(4018, 'Thomas Williams'),
    card(3970, 'Joshua Carrico'),
    card(4016, 'Carrico'),
    card(3957, 'Aidan West Crews'),
    card(4185, 'West-Crews'),
    card(3594, 'Steven J Siwecki'),
    card(4139, 'Siwecki'),
  ])
  assert.ok(together(groups, 4132, 4190, 4013, 4014))
  assert.ok(together(groups, 4126, 4018), 'Tom is Thomas')
  assert.ok(together(groups, 3970, 4016), 'a surname alone joins the one full name it ends')
  assert.ok(together(groups, 3957, 4185), 'a hyphenated surname matches the spaced one')
  assert.ok(together(groups, 3594, 4139))
  assert.equal(groups.get(4190)?.label, 'Robert and Elizabeth Badgett')
  assert.notEqual(groups.get(4126)?.key, groups.get(4132)?.key)
})

test('different people never share a claim card', () => {
  const groups = claimGroups([
    card(4122, 'Mike Arnold'),
    card(4123, 'Arnold Makarov & Jane Burke'),
    card(4003, 'Naa Brown'),
    card(4076, 'Sarah Brown'),
    card(4500, 'Brown'),
    card(4501, 'Brown'),
    card(3541, 'Adrian W'),
    card(4178, 'Adrian McNamara'),
  ])
  assert.equal(groups.size, 0, 'Arnold the surname is not Arnold the first name, and "Brown" could be either Brown')
})

test('carriers, our own names, staff, roll-ups and placeholders never pull claims together', () => {
  const groups = claimGroups([
    card(1, 'USAA'),
    card(2, 'USAA'),
    card(3, 'Flood Doctor'),
    card(4, 'Flood Doctor'),
    card(5, 'Steve'),
    card(6, 'Steve'),
    card(7, 'Multiple clients'),
    card(8, 'Multiple clients'),
    card(9, '23 clients'),
    card(10, '23 clients'),
    card(11, 'Amber Gray, Rodolfo Morera, Charles Musser, Lynn Orlowski, Linda Pickering'),
    card(12, 'Charles Musser'),
    card(13, 'Linda Pickering'),
  ], { staff: ['steve', 'Steve'] })
  assert.equal(groups.size, 0)
})

test('checked-off cards and lone cards get no group', () => {
  const groups = claimGroups([
    card(4121, 'Caroline Bermel', 'Invoice 115268'),
    card(4127, 'Caroline Bermel', 'Invoice 115268', 'done'),
    card(4140, 'Kevin Cigler'),
  ])
  assert.equal(groups.size, 0)
})

test('the client line parser reads the forms Aries writes', () => {
  assert.deepEqual(parseClient('Pickering, Linda & Orlowski, Lynn')?.people.map((who) => who.tokens.join(' ')),
    ['linda pickering', 'lynn orlowski'])
  assert.deepEqual(parseClient('Harrison and Anne Crecraft')?.people.map((who) => who.tokens.join(' ')),
    ['harrison crecraft', 'anne crecraft'])
  assert.equal(parseClient('One Central Park condominium association')?.org, 'one central park condominium association')
  assert.equal(parseClient('Lincoln Park Condominium')?.people.length, 0)
  assert.equal(parseClient('Kelly, Szurgyi, Daehn')?.rollup, true)
  assert.equal(parseClient(''), null)
  assert.deepEqual(claimNumbers('Invoice 1120'), [], 'four digits could be a street number')
  assert.deepEqual(claimNumbers('CID #23959115'), ['23959115'])
})

test('the board API marks cards that share a claim, and leaves the rest alone', async () => {
  const db = new FakeD1Database()
  const env = {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
  const brief = (client, claim) => ({
    needs: 'Needs a reply.', next_step: 'Reply.', action: 'reply', owner_hint: '', waiting_on: '',
    waiting_since: '', client, claim, amount: '', deadline: '', deadline_note: '', phone: '',
    counsel_only: false, last_ours: null, last_theirs: null, messages: 1, generated_at: '2026-10-04T12:00:00Z',
  })
  const accepted = await worker.fetch(new Request('https://aries-publish.flood.doctor/api/sync/snapshot', {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items: [
      { id: 4095, title: '1306 S Poe St driveway staining', status: 'open', brief: brief('Sara King', '') },
      { id: 4138, title: 'King, 1306 S Poe St driveway oil damage', status: 'open', brief: brief('Sara King', '') },
      { id: 3612, title: 'Cigler check mailed', status: 'open', brief: brief('Kevin Cigler', '') },
    ] }),
  }), env, {})
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).briefs_dropped, 0)

  const board = await (await worker.fetch(new Request('https://aries.flood.doctor/api/board', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'mark@flood.doctor' },
  }), env, {})).json()
  const byId = new Map(board.items.map((item) => [item.id, item]))
  assert.equal(byId.get(4095).claim_group, byId.get(4138).claim_group)
  assert.equal(byId.get(4095).claim_label, 'Sara King')
  assert.equal(byId.get(3612).claim_group, undefined)
})
