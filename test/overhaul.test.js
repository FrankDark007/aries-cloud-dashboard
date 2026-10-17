import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/index.js'
import { claimNumbers, claimGroups, extractStreetAddresses, extractThreadKey } from '../src/claim-groups.js'
import { bulkActionPlan, isAutoResolvedCandidate, isStaleCard, matchesBoardFilters } from '../src/board-ui-state.js'
import { SqliteD1 } from './sqlite-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function baseBrief(overrides = {}) {
  return {
    needs: 'Follow up with adjuster.',
    next_step: 'Send invoice.',
    action: 'reply',
    owner_hint: 'mark',
    waiting_on: '',
    waiting_since: '',
    client: 'Robert Badgett',
    claim: '',
    amount: '$8,450.00',
    deadline: '',
    deadline_note: '',
    phone: '',
    counsel_only: false,
    last_ours: null,
    last_theirs: null,
    messages: 2,
    generated_at: '2026-10-14T12:00:00Z',
    ...overrides,
  }
}

test('Fix 1: classifies auto_resolved_candidate cards and auto-closes them via POST /api/board/auto-close-handled', async () => {
  const db = new SqliteD1()
  const env = {
    DB: db,
    ALLOWED_EMAILS: 'frankd@flooddoctorva.com',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,flooddoctorva.com,restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-pub-token',
    STALE_AFTER_SECONDS: '300',
  }

  const items = [
    {
      id: 501,
      title: 'Badgett claim closed confirmation',
      status: 'open',
      mailbox: 'aries@flood.doctor',
      account: 'aries',
      thread_id: 'thread123456',
      brief: baseBrief({ action: 'close' }),
    },
    {
      id: 502,
      title: 'Pickering supplement replied',
      status: 'open',
      source_account: 'steve@restorationdoctors.com',
      brief: baseBrief({
        action: 'wait',
        last_theirs: { by: 'Adjuster', at: '2026-10-10T10:00:00Z', what: 'requested photos' },
        last_ours: { by: 'Steve', at: '2026-10-11T14:30:00Z', what: 'sent drying logs and photos' },
      }),
    },
    {
      id: 503,
      title: 'Needs our follow-up even though we wrote last',
      status: 'open',
      brief: baseBrief({
        action: 'follow_up',
        last_theirs: { by: 'Adjuster', at: '2026-10-10T10:00:00Z', what: 'acknowledged' },
        last_ours: { by: 'Mark', at: '2026-10-11T14:30:00Z', what: 'promised callback' },
      }),
    },
    {
      id: 504,
      title: 'Customer replied most recently',
      status: 'open',
      brief: baseBrief({
        action: 'reply',
        last_ours: { by: 'Mark', at: '2026-10-10T10:00:00Z', what: 'sent estimate' },
        last_theirs: { by: 'Customer', at: '2026-10-12T09:00:00Z', what: 'asked a question' },
      }),
    },
  ]

  const pubRes = await worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/snapshot`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-pub-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  }), env, {})
  assert.equal(pubRes.status, 200)

  const boardRes = await worker.fetch(new Request(`https://${UI_HOST}/api/board`, {
    headers: { 'Cf-Access-Authenticated-User-Email': 'frankd@flooddoctorva.com' },
  }), env, {})
  const board = await boardRes.json()
  const byId = new Map(board.items.map((i) => [i.id, i]))

  assert.equal(byId.get(501).auto_resolved_candidate, true)
  assert.equal(byId.get(501).mailbox, 'aries@flood.doctor')
  assert.equal(byId.get(501).source_account, 'aries')
  assert.equal(Object.hasOwn(byId.get(501), 'account'), false)
  assert.equal(byId.get(502).auto_resolved_candidate, true)
  assert.equal(byId.get(502).source_account, 'steve@restorationdoctors.com')
  assert.equal(byId.get(503).auto_resolved_candidate, undefined)
  assert.equal(byId.get(504).auto_resolved_candidate, undefined)

  for (const body of ['{', JSON.stringify({ids:[503,504]})]) {
    const response = await worker.fetch(new Request(`https://${UI_HOST}/api/board/auto-close-handled`, {
      method:'POST', headers:{'Cf-Access-Authenticated-User-Email':'frankd@flooddoctorva.com','content-type':'application/json'}, body,
    }), env, {})
    assert.equal(response.status, body === '{' ? 400 : 200)
    if (response.ok) assert.equal((await response.json()).closed_count, 0)
  }

  // Auto-close all candidates
  const closeRes = await worker.fetch(new Request(`https://${UI_HOST}/api/board/auto-close-handled`, {
    method: 'POST',
    headers: {
      'Cf-Access-Authenticated-User-Email': 'frankd@flooddoctorva.com',
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  }), env, {})
  assert.equal(closeRes.status, 202)
  const closed = await closeRes.json()
  assert.equal(closed.closed_count, 2)
  assert.deepEqual(closed.closed_ids.sort(), [501, 502])
  assert.equal(closed.note, 'Auto-closed: handled in email thread')

  // Subsequent board read shows 501 and 502 as done with the auto-close note
  const afterBoard = await (await worker.fetch(new Request(`https://${UI_HOST}/api/board`, {
    headers: { 'Cf-Access-Authenticated-User-Email': 'frankd@flooddoctorva.com' },
  }), env, {})).json()
  const afterById = new Map(afterBoard.items.map((i) => [i.id, i]))
  assert.equal(afterById.get(501).status, 'done')
  assert.equal(afterById.get(502).status, 'done')
  assert.equal(afterById.get(501).note, 'Auto-closed: handled in email thread')
  assert.equal(afterById.get(503).status, 'open')
  assert.equal(afterById.get(504).status, 'open')
  db.close()
})

test('Fix 2: claimGroupDetails groups by shared thread_id/source_url, property street address, and client surname in title', () => {
  assert.deepEqual(extractStreetAddresses('Re: [aries inbox] 1306 S Poe St driveway staining').map(a => a.key), ['1306 s poe st'])
  assert.deepEqual(extractStreetAddresses('King - 1306 South Poe Street oil damage').map(a => a.key), ['1306 s poe st'])
  assert.equal(extractThreadKey({ source_url: 'https://mail.google.com/mail/u/0/#inbox/192837465abcde' }), 'thread:192837465abcde')
  assert.equal(extractThreadKey({ thread_id: '192837465abcde' }), 'thread:192837465abcde')

  const groups = claimGroups([
    // Group A: shared street address in title even with empty brief.client
    { id: 10, title: 'Re: 1306 S Poe St driveway staining', status: 'open', brief: { client: '', claim: '' } },
    { id: 11, title: '[aries] 1306 South Poe Street oil cleanup', status: 'open', brief: { client: '', claim: '' } },
    // Group B: shared source_url / thread_id
    { id: 20, title: 'Initial mitigation question', status: 'open', source_url: 'https://mail.google.com/mail/u/0/#all/1a03556450dc8149' },
    { id: 21, title: 'Follow-up attachment', status: 'open', thread_id: '1a03556450dc8149' },
    // Group C: client surname in title when brief.client is empty on one card
    { id: 30, title: 'Estimate approval', status: 'open', brief: { client: 'Joshua Carrico', claim: '' } },
    { id: 31, title: 'Re: Carrico: final dry log', status: 'open', brief: { client: '', claim: '' } },
  ])

  assert.equal(groups.get(10)?.key, groups.get(11)?.key)
  assert.equal(groups.get(10)?.label, '1306 S Poe St')
  assert.equal(groups.get(20)?.key, groups.get(21)?.key)
  assert.equal(groups.get(30)?.key, groups.get(31)?.key)
  assert.equal(groups.get(31)?.label, 'Joshua Carrico')
})

test('Fix 1 & 4: bulkActionPlan supports done and matchesBoardFilters supports quick filters (ready, stale, urgent, unassigned)', () => {
  const items = [
    { id: 1, title: 'Stale item', status: 'open', updated: '2026-10-01', brief: { action: 'close' } },
    { id: 2, title: 'Fresh item', status: 'open', updated: '2026-10-14', assignee: 'steve', brief: { action: 'reply' } },
  ]
  assert.equal(isAutoResolvedCandidate(items[0]), true)
  assert.equal(isStaleCard(items[0], '2026-10-15'), true)
  assert.equal(isStaleCard(items[1], '2026-10-15'), false)
  assert.equal(matchesBoardFilters(items[0], { quick: 'ready' }, '2026-10-15'), true)
  assert.equal(matchesBoardFilters(items[1], { quick: 'ready' }, '2026-10-15'), false)
  assert.equal(matchesBoardFilters(items[0], { quick: 'stale' }, '2026-10-15'), true)
  assert.equal(matchesBoardFilters(items[1], { quick: 'stale' }, '2026-10-15'), false)
  assert.equal(matchesBoardFilters(items[0], { quick: 'unassigned' }, '2026-10-15'), true)
  assert.equal(matchesBoardFilters(items[1], { quick: 'unassigned' }, '2026-10-15'), false)

  const plan = bulkActionPlan(items, new Set(['1', '2']), 'done', '')
  assert.equal(plan.length, 2)
  assert.deepEqual(plan.map(p => [p.id, p.payload.operation]), [[1, 'done'], [2, 'done']])
})

test('claim numbers accept item metadata without treating street numbers as claims', () => {
  assert.deepEqual(claimNumbers({brief:{claim:'USAA 021792489-801'}}), ['021792489801'])
  assert.deepEqual(claimNumbers('Invoice 1120 at 1306 Main Street'), [])
})
