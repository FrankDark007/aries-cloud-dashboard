import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 09/29/2026: "if i want to change mark's name to Mike, I dont have a way to do that
// right now. If mark changes his email address, I want to be able to update it. User Settings
// tab." These cover the roster behind that tab and everything on the board that reads it.

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const OWNER = 'darakhshan.farough@gmail.com'

function settings(db) {
  return {
    ALLOWED_EMAILS: OWNER,
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,flooddoctorva.com,restorationdoctors.com',
    ACTIVITY_OWNER_EMAILS: OWNER,
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function seeded() {
  const db = new FakeD1Database()
  db.seedTeam()
  db.seedSnapshot([{ id: 7, title: 'Call the carrier', assignee: 'mark', status: 'open' }], new Date().toISOString())
  return db
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function saveUser(email, body) {
  return as(email, '/api/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function boardAction(email, body) {
  return as(email, '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function board(db, email = OWNER) {
  const response = await worker.fetch(as(email, '/api/board'), settings(db), {})
  assert.equal(response.status, 200)
  return response.json()
}

test('the user list is served to the owner and is a 404 for every other identity', async () => {
  const db = seeded()
  const owner = await worker.fetch(as(OWNER, '/api/team'), settings(db), {})
  assert.equal(owner.status, 200)
  const body = await owner.json()
  assert.deepEqual(body.team.map((member) => member.key), ['frank', 'mark', 'steve', 'shayan', 'katherine'])
  assert.equal(body.team[1].email, 'mark@flood.doctor')

  for (const email of ['mark@flood.doctor', 'frankd@flooddoctorva.com', 'outsider@example.com']) {
    const read = await worker.fetch(as(email, '/api/team'), settings(db), {})
    assert.equal(read.status, 404, email)
    const write = await worker.fetch(saveUser(email, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
    assert.equal(write.status, 404, email)
  }
  assert.equal(db.team.find((row) => row.key === 'mark').name, 'Mark')
  const put = await worker.fetch(as(OWNER, '/api/team', { method: 'PUT' }), settings(db), {})
  assert.equal(put.status, 405)
})

test('renaming Mark to Mike keeps his cards and renames him everywhere the board names him', async () => {
  const db = seeded()
  db.activity.push({
    id: 1, at: new Date().toISOString(), actor_email: OWNER, source: 'board', operation: 'assign',
    item_id: '7', value: 'mark', title: null, ip: null, country: null, user_agent: null,
  })
  const saved = await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
  assert.equal(saved.status, 200)
  const body = await saved.json()
  assert.equal(body.changed, true)
  assert.equal(body.team.find((member) => member.key === 'mark').name, 'Mike')

  const payload = await board(db)
  assert.equal(payload.items[0].assignee, 'mark', 'the card still belongs to the same person')
  assert.deepEqual(payload.team.find((member) => member.key === 'mark'), { key: 'mark', name: 'Mike' })
  assert.equal(payload.items[0].history[0].what, 'assigned it to Mike')
  assert.equal(payload.team.some((member) => 'email' in member), false, 'staff get names, not the address book')

  assert.deepEqual(db.teamChanges.map(({ actor_email, user_key, field, old_value, new_value }) => ({ actor_email, user_key, field, old_value, new_value })), [
    { actor_email: OWNER, user_key: 'mark', field: 'name', old_value: 'Mark', new_value: 'Mike' },
  ])
})

test('changing an email keeps the old address as his, so his history and his To-Do access follow him', async () => {
  const db = seeded()
  db.activity.push({
    id: 1, at: new Date().toISOString(), actor_email: 'mark@flood.doctor', source: 'board', operation: 'done',
    item_id: '7', value: null, title: null, ip: null, country: null, user_agent: null,
  })
  const saved = await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'Mike@Flood.Doctor ' }), settings(db), {})
  assert.equal(saved.status, 200)
  const mark = (await saved.json()).team.find((member) => member.key === 'mark')
  assert.equal(mark.email, 'mike@flood.doctor')
  assert.deepEqual(mark.past_emails, ['mark@flood.doctor'])

  const payload = await board(db)
  assert.equal(payload.items[0].history[0].who, 'Mike', 'an action under the old address names him')

  db.seedTodoCatalogue([{ id: 'task-0123456789abcd', text: 'Call the carrier' }], new Date().toISOString())
  const todo = (email, eventId) => as(email, '/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId, item_id: 'task-0123456789abcd', operation: 'toggle',
      payload: { done: true }, client_ts: '2026-09-30T12:00:00.000Z',
    }),
  })
  const fromNew = await worker.fetch(todo('mike@flood.doctor', 'ui-new-address'), settings(db), {})
  assert.equal(fromNew.status, 202)
  assert.equal((await fromNew.json()).operation.actor_name, 'Mike')
  const fromOld = await worker.fetch(todo('mark@flood.doctor', 'ui-old-address'), settings(db), {})
  assert.equal(fromOld.status, 202)
  const steve = await worker.fetch(todo('steve@restorationdoctors.com', 'ui-steve'), settings(db), {})
  assert.equal(steve.status, 202, 'every roster member can edit To-Do')
  assert.equal((await steve.json()).operation.actor_name, 'Steve')

  // Changing it again pushes the newer old address to the front and never lists the current one.
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
  const again = await (await worker.fetch(as(OWNER, '/api/team'), settings(db), {})).json()
  assert.deepEqual(again.team.find((member) => member.key === 'mark').past_emails, ['mike@flood.doctor'])
})

test('a bad name or address is refused with a message that says how to fix it', async () => {
  const db = seeded()
  const cases = [
    [{ key: 'mark', name: '', email: 'mark@flood.doctor' }, 400, /Enter a name/],
    [{ key: 'mark', name: '<b>Mike</b>', email: 'mark@flood.doctor' }, 400, /Enter a name/],
    [{ key: 'mark', name: 'M'.repeat(41), email: 'mark@flood.doctor' }, 400, /Enter a name/],
    [{ key: 'mark', name: 'Mike', email: 'mike' }, 400, /full email address/],
    [{ key: 'mark', name: 'Mike', email: 'mike@example.com' }, 400, /company address/],
    [{ key: 'mark', name: 'Mike', email: 'aries@flood.doctor' }, 400, /Aries sends from/],
    [{ key: 'mark', name: 'Mike', email: 'steve@restorationdoctors.com' }, 409, /Steve already uses steve@restorationdoctors.com/],
    [{ key: 'nobody', name: 'Mike', email: 'mike@flood.doctor' }, 404, /not on the list/],
    [{ name: 'Jose', email: 'steve@restorationdoctors.com' }, 409, /Steve already uses/],
  ]
  for (const [body, status, message] of cases) {
    const response = await worker.fetch(saveUser(OWNER, body), settings(db), {})
    assert.equal(response.status, status, JSON.stringify(body))
    assert.match((await response.json()).error, message, JSON.stringify(body))
  }
  const wrongType = await worker.fetch(as(OWNER, '/api/team', { method: 'POST', body: '{}' }), settings(db), {})
  assert.equal(wrongType.status, 415)
  assert.equal(db.teamChanges.length, 0)
  assert.equal(db.team.find((row) => row.key === 'mark').name, 'Mark')

  const unchanged = await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mark', email: 'mark@flood.doctor' }), settings(db), {})
  assert.equal((await unchanged.json()).changed, false)
  assert.equal(db.teamChanges.length, 0)
})

test('a new user can be assigned, nudged and suggested by Aries straight away', async () => {
  const db = seeded()
  const added = await worker.fetch(saveUser(OWNER, { name: 'José García', email: 'jose@flood.doctor' }), settings(db), {})
  assert.equal(added.status, 201)
  const body = await added.json()
  assert.equal(body.key, 'jose')
  assert.deepEqual(body.team.at(-1), { key: 'jose', name: 'José García', email: 'jose@flood.doctor', past_emails: [] })

  const second = await (await worker.fetch(saveUser(OWNER, { name: 'Jose Lopez', email: 'jlopez@flood.doctor' }), settings(db), {})).json()
  assert.equal(second.key, 'joselopez', 'a taken first name adds the last name')
  const reserved = await (await worker.fetch(saveUser(OWNER, { name: 'Aries', email: 'ariesperson@flood.doctor' }), settings(db), {})).json()
  assert.equal(reserved.key, 'aries2', 'nobody becomes the Aries key')

  const assign = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'assign', id: 7, value: 'jose' }), settings(db), {})
  assert.equal(assign.status, 202)
  const nudge = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'nudge', id: 7, value: 'jose' }), settings(db), {})
  assert.equal(nudge.status, 202)
  const stranger = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'assign', id: 7, value: 'bob' }), settings(db), {})
  assert.equal(stranger.status, 400)
  const nudgeAries = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'nudge', id: 7, value: 'aries' }), settings(db), {})
  assert.equal(nudgeAries.status, 400)

  const brief = {
    needs: 'A reply to the adjuster.', next_step: 'José: call the adjuster.', waiting_on: '', client: '', claim: '',
    amount: '', deadline_note: '', phone: '', action: 'call', owner_hint: 'jose', waiting_since: '', deadline: '',
    counsel_only: false, last_ours: null, last_theirs: null, messages: 2, generated_at: '2026-09-30T12:00:00Z',
  }
  const published = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/snapshot`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 7, title: 'Call the carrier', assignee: 'jose', brief }] }),
  }), settings(db), {})
  assert.equal((await published.json()).briefs_dropped, 0)
  const payload = await board(db)
  assert.equal(payload.items[0].brief.owner_hint, 'jose')
  assert.equal(payload.team.at(-3).name, 'José García')
})

test('Aries reads the roster from the sync host with its token, and only with it', async () => {
  const db = seeded()
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mike@flood.doctor' }), settings(db), {})
  const synced = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/team`, {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), settings(db), {})
  assert.equal(synced.status, 200)
  const body = await synced.json()
  assert.deepEqual(body.team[1], { key: 'mark', name: 'Mike', email: 'mike@flood.doctor', past_emails: ['mark@flood.doctor'] })

  const anonymous = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/team`), settings(db), {})
  assert.equal(anonymous.status, 401)
  const onUiHost = await worker.fetch(as('mark@flood.doctor', '/api/sync/team'), settings(db), {})
  assert.equal(onUiHost.status, 404)
})

test('before the roster table is seeded the board keeps today’s five people', async () => {
  const db = new FakeD1Database()
  db.seedSnapshot([{ id: 7, title: 'Call the carrier' }], new Date().toISOString())
  const payload = await board(db)
  assert.deepEqual(payload.team.map((member) => member.name), ['Frank', 'Mark', 'Steve', 'Shayan', 'Katherine'])
})

test('the page carries a User settings tab that only the owner is shown', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /<button id="show-users" type="button" aria-pressed="false" hidden>User settings<\/button>/)
  assert.match(page, /\/api\/team/)
  assert.equal((await board(db, 'mark@flood.doctor')).activity, false)
  assert.equal((await board(db)).activity, true)
})

// Frank, 09/29/2026: "i want to be able to assign a task to a teamate, and also assign it to
// aries so that aries can do some prep work for that teamate."
test('Aries can prep a card for its teammate while the teammate keeps it', async () => {
  const db = seeded()
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mark@flood.doctor' }), settings(db), {})
  const prep = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'prep', id: 7, value: 'mark' }), settings(db), {})
  assert.equal(prep.status, 202)
  const queued = db.commands.at(-1)
  assert.deepEqual({ operation: queued.operation, value: queued.value, note: queued.note }, { operation: 'prep', value: 'mark', note: null })

  const payload = await board(db)
  assert.equal(payload.items[0].assignee, 'mark', 'the teammate still owns the card')
  assert.equal(payload.items[0].history[0].what, 'asked Aries to prep it for Mike')
  assert.equal(payload.items[0].history[0].who, 'Dom')

  for (const value of ['aries', 'bob', '', undefined]) {
    const refused = await worker.fetch(boardAction('dom@flood.doctor', { operation: 'prep', id: 7, value }), settings(db), {})
    assert.equal(refused.status, 400, String(value))
  }
})

test('the card carries a prep button next to the nudge', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /<div class="prep-row" hidden><button class="prep-button" data-action="prep" type="button"><\/button>/)
  assert.match(page, /operation: 'prep', id: item\.id, value: owner/)
})

// Frank, 09/29/2026: "createn an urgent button where I can mark a card Urgent and it appears at
// the top and it nudges the teamates that must do something asap".
test('Urgent is on or off, shows at once, and rides the snapshot', async () => {
  const db = seeded()
  const on = await worker.fetch(boardAction(OWNER, { operation: 'urgent', id: 7, value: 'on' }), settings(db), {})
  assert.equal(on.status, 202)
  let payload = await board(db)
  assert.equal(typeof payload.items[0].urgent, 'string', 'a queued urgent shows before Aries applies it')
  assert.equal(payload.items[0].history[0].what, 'marked it urgent')
  for (const value of ['yes', '', undefined, true]) {
    const refused = await worker.fetch(boardAction(OWNER, { operation: 'urgent', id: 7, value }), settings(db), {})
    assert.equal(refused.status, 400, String(value))
  }
  const off = await worker.fetch(boardAction(OWNER, { operation: 'urgent', id: 7, value: 'off' }), settings(db), {})
  assert.equal(off.status, 202)
  payload = await board(db)
  assert.equal('urgent' in payload.items[0], false)

  const published = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/snapshot`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 7, title: 'Call the carrier', urgent: '2026-09-30T09:00:00-04:00' }] }),
  }), settings(db), {})
  assert.equal(published.status, 200)
})

// Frank, 09/29/2026: "remove cards from the board that are snoozed so they dont clutter the
// board. brin them back after the snooz period".
test('a queued snooze marks the card snoozed so it leaves the board at once', async () => {
  const db = seeded()
  await worker.fetch(boardAction(OWNER, { operation: 'snooze', id: 7, value: '2099-01-02' }), settings(db), {})
  const payload = await board(db)
  assert.equal(payload.items[0].status, 'snoozed')
  assert.equal(payload.items[0].due, '2099-01-02')
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /function isResting\(item\)/)
  assert.match(page, /<details id="snoozed-list" class="snoozed-list" hidden>/)
})

// Frank, 09/30/2026: "the board cards are huge now. make them collapsobale and give each use a
// tab where they can see a list of ony the cards assigned to them".
test('the board says who is looking, so My cards can show only theirs', async () => {
  const db = seeded()
  assert.deepEqual((await board(db, 'mark@flood.doctor')).me, { key: 'mark', name: 'Mark' })
  assert.deepEqual((await board(db)).me, { key: 'frank', name: 'Frank' }, 'Frank signs in with his own address')
  const outside = await worker.fetch(as('newhire@flood.doctor', '/api/board'), settings(db), {})
  assert.equal((await outside.json()).me, null, 'someone not on the list gets no My cards tab')
  await worker.fetch(saveUser(OWNER, { key: 'mark', name: 'Mike', email: 'mike@flood.doctor' }), settings(db), {})
  assert.deepEqual((await board(db, 'mike@flood.doctor')).me, { key: 'mark', name: 'Mike' })
})

test('cards fold and the page carries the My cards tab', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  assert.match(page, /<button id="show-mine" type="button" aria-pressed="false" hidden>My cards<\/button>/)
  assert.match(page, /<button class="card-toggle" data-action="toggle" type="button" aria-expanded="false" aria-label="Show details">/)
  assert.match(page, /\.card\[data-collapsed="true"\]/)
  assert.match(page, /<button id="expand-all" class="refresh-button" type="button">Expand all<\/button>/)
})

// Frank, 09/30/2026: "add an URGENT action button to cards". It sits in the card header, so a
// folded card shows it too, and it is the only urgent control on the card.
test('the urgent button is in the card header', async () => {
  const db = seeded()
  const page = await (await worker.fetch(as('mark@flood.doctor', '/'), settings(db), {})).text()
  const header = page.slice(page.indexOf('<div class="card-top-right">'), page.indexOf('<h3></h3>'))
  assert.match(header, /<button class="urgent-toggle" data-action="urgent" type="button" aria-pressed="false">Mark urgent<\/button>/)
  const actions = page.slice(page.indexOf('<div class="actions">'), page.indexOf('<div class="choices"'))
  assert.doesNotMatch(actions, /urgent/, 'the action row no longer carries a second one')
  assert.doesNotMatch(page, /\.card\[data-collapsed="true"\] :is\([^)]*urgent/, 'folding never hides it')
})
