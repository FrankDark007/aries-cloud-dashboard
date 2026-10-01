import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { APP_HTML } from '../src/ui.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 09/30/2026: "audit the aries todo list and aries prep work and aries cards ob the board
// and enhance in anywway that you can". These cover what the audit changed in the worker: the
// brief's own title, what Aries is doing on a card, and To-Do changes that reach the board.

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const TASK_ID = 'task-0123456789abcd'
const MANUAL_ID = 'task-fedcba98765432'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,flooddoctorva.com,restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function sync(path, body) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function brief(overrides = {}) {
  return {
    needs: 'Travelers issued its final determination on the Malik claim.',
    next_step: 'Frank: decide whether to escalate.',
    action: 'decide',
    owner_hint: 'frank',
    waiting_on: '',
    waiting_since: '',
    client: 'Malik',
    claim: 'I9G3968',
    amount: '$40,859.00',
    deadline: '',
    deadline_note: '',
    phone: '',
    counsel_only: false,
    last_ours: null,
    last_theirs: null,
    messages: 3,
    generated_at: '2026-09-30T04:00:00Z',
    ...overrides,
  }
}

test('a brief carries its own title, and a card says what Aries is doing on it', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const accepted = await worker.fetch(sync('/api/sync/snapshot', { items: [
    { id: 4011, title: '[aries inbox] RE: [External] Re: Claim Nbr: I9G3968', status: 'open', assignee: 'steve',
      brief: brief({ title: 'Malik: Travelers final determination, $40,859' }),
      prep: { status: 'running', for: 'steve', at: '2026-09-30T04:10:00Z', task: 'ot-x', prompt: 'never published' } },
    { id: 4012, title: 'Aries card', status: 'open', assignee: 'aries',
      aries_task: { status: 'ready', at: '2026-09-30T03:00:00Z', finished_at: '2026-09-30T03:20:00Z' } },
    { id: 4013, title: 'Bad prep', status: 'open', prep: { status: 'exploded', at: 'soon' } },
  ] }), env, {})
  assert.equal(accepted.status, 200)

  const board = await (await worker.fetch(as('steve@restorationdoctors.com', '/api/board'), env, {})).json()
  const cards = Object.fromEntries(board.items.map((item) => [item.id, item]))
  assert.equal(cards[4011].brief.title, 'Malik: Travelers final determination, $40,859')
  assert.deepEqual(cards[4011].prep, { status: 'running', for: 'steve', at: '2026-09-30T04:10:00Z' },
    'only the state is published, never the task or its prompt')
  assert.deepEqual(cards[4012].aries_task, { status: 'ready', at: '2026-09-30T03:00:00Z', finished_at: '2026-09-30T03:20:00Z' })
  assert.equal(cards[4013].title, 'Bad prep', 'an off-contract task state drops only itself')
  assert.equal('prep' in cards[4013], false)
  assert.equal('title' in brief(), false, 'a brief without a title stays valid')
})

function catalogueItem(overrides = {}) {
  return {
    id: TASK_ID,
    text: 'URGENT: Confirm the Cigler check arrived',
    client: 'Kevin Cigler',
    sourceRevision: 'rev-1',
    upstreamIds: ['4101', 'board:4102', 'gmail:message-1'],
    assignee: 'Dom',
    seedDone: false,
    urgent: true,
    ariesPrep: 'ready',
    ariesPrepFor: 'steve',
    ...overrides,
  }
}

function todoAction(eventId, itemId, operation, payload, email = 'frankd@flooddoctorva.com') {
  return as(email, '/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, item_id: itemId, operation, payload, client_ts: new Date().toISOString() }),
  })
}

async function todoBoard() {
  const db = new FakeD1Database()
  db.seedTeam()
  const env = settings(db)
  const published = await worker.fetch(sync('/api/sync/todos/catalogue', { items: [
    catalogueItem(),
    catalogueItem({ id: MANUAL_ID, text: 'Buy fans', upstreamIds: undefined, urgent: undefined, ariesPrep: 'thinking' }),
  ] }), env, {})
  assert.equal(published.status, 200)
  return { db, env }
}

test('a To-Do task carries urgent and Aries prep from its card, and ignores an unknown prep state', async () => {
  const { env } = await todoBoard()
  const list = await (await worker.fetch(as('frankd@flooddoctorva.com', '/api/todos'), env, {})).json()
  const items = Object.fromEntries(list.items.map((item) => [item.id, item]))
  assert.equal(items[TASK_ID].urgent, true)
  assert.equal(items[TASK_ID].ariesPrep, 'ready')
  assert.equal(items[TASK_ID].ariesPrepFor, 'steve')
  assert.equal('urgent' in items[MANUAL_ID], false)
  assert.equal('ariesPrep' in items[MANUAL_ID], false)
})

test('checking off or handing on a To-Do task changes the board cards it came from', async () => {
  const { db, env } = await todoBoard()
  const done = await worker.fetch(todoAction('ui-0000000000000001', TASK_ID, 'toggle', { done: true }), env, {})
  assert.equal(done.status, 202)
  assert.deepEqual(db.commands.map((command) => [command.operation, command.item_id, command.value]),
    [['done', 4101, null], ['done', 4102, null]], 'the card ids only, never a mail id')
  assert.equal(db.commands[0].actor_email, 'frankd@flooddoctorva.com')

  await worker.fetch(todoAction('ui-0000000000000002', TASK_ID, 'toggle', { done: false }), env, {})
  assert.deepEqual(db.commands.slice(2).map((command) => command.operation), ['reopen', 'reopen'])

  // The desktop app sends a name; the board takes the roster key.
  await worker.fetch(todoAction('ui-0000000000000003', TASK_ID, 'assign', { assignee: 'Steve' }), env, {})
  assert.deepEqual(db.commands.slice(4).map((command) => [command.operation, command.value]),
    [['assign', 'steve'], ['assign', 'steve']])

  const before = db.commands.length
  await worker.fetch(todoAction('ui-0000000000000004', TASK_ID, 'assign', { assignee: 'Zed' }), env, {})
  await worker.fetch(todoAction('ui-0000000000000005', MANUAL_ID, 'toggle', { done: true }), env, {})
  // A repeat of an event already stored is not a new change.
  await worker.fetch(todoAction('ui-0000000000000001', TASK_ID, 'toggle', { done: true }), env, {})
  assert.equal(db.commands.length, before, 'unknown owners, hand-made tasks and repeats change no card')
})

test('a later change on the board wins over an older To-Do owner or check-off', async () => {
  const { db, env } = await todoBoard()
  await worker.fetch(todoAction('ui-0000000000000006', TASK_ID, 'assign', { assignee: 'shayan' }), env, {})
  const before = await (await worker.fetch(as('frankd@flooddoctorva.com', '/api/todos'), env, {})).json()
  assert.equal(before.items.find((item) => item.id === TASK_ID).assignee, 'shayan')

  // The board hands the card to Katherine afterward, and the next catalogue says so.
  const later = new Date(Date.now() + 60000).toISOString()
  await worker.fetch(sync('/api/sync/todos/catalogue', { items: [
    catalogueItem({ assignee: 'katherine', sourceUpdatedAt: later }),
  ] }), env, {})
  const after = await (await worker.fetch(as('frankd@flooddoctorva.com', '/api/todos'), env, {})).json()
  assert.equal(after.items.find((item) => item.id === TASK_ID).assignee, 'katherine')
  assert.equal(db.todoOperations.length, 1, 'the operation is kept, only overtaken')
})

test('the page shows counsel-only and Aries state on folded cards and picks To-Do owners from the roster', () => {
  assert.match(APP_HTML, /<span class="chip counsel" hidden>Counsel only<\/span>/)
  assert.match(APP_HTML, /<span class="chip aries-state" hidden><\/span>/)
  const todo = APP_HTML.slice(APP_HTML.indexOf('function renderTodos'), APP_HTML.indexOf('async function loadTodos'))
  assert.doesNotMatch(todo, /window\.prompt/, 'no free-text owner or date prompts')
  assert.match(todo, /createElement\('select'\)/)
  assert.match(APP_HTML, /One client, one clear action, one owner\./)
})
