import assert from 'node:assert/strict'
import test from 'node:test'
import { APP_HTML } from '../src/ui.js'
import { cardExceptions, matchesBoardFilters, commandReceiptText, bulkActionPlan, bulkUndoPayload, reconcileBoardItems } from '../src/board-ui-state.js'

test('board filters combine text, identity, responsibility, urgency, due date and status', () => {
  const item = { id: 34, title: 'Review repair scope', status: 'open', due: '2026-10-10', priority: 'urgent', assignee: 'mark', responsibility: { owner: 'frank' }, brief: { client: 'Pickering', claim: 'AB-14' }, identity: { invoice_id: '115224' } }
  assert.equal(matchesBoardFilters(item, { query: 'repair', owner: 'frank', client: 'PICKERING', claim: '115224', urgency: 'urgent', due: 'overdue', status: 'open' }, '2026-10-11'), true)
  for (const filters of [{ owner: 'mark' }, { due: 'today' }, { urgency: 'normal' }, { claim: 'AB-99' }, { status: 'done' }, { owner: 'unassigned' }]) assert.equal(matchesBoardFilters(item, filters, '2026-10-11'), false)
  assert.equal(matchesBoardFilters({ title: 'Undated', due: 'unknown' }, { due: 'undated', owner: 'unassigned' }, '2026-10-11'), true)
})

test('exceptions distinguish stale and unknown evidence from actual command and preparation failures', () => {
  const now = Date.parse('2026-10-11T12:00:00Z')
  const item = { source_updated_at: '2026-10-01T12:00:00Z', prep: { status: 'timed_out', error: 'Document absent' }, command_receipt: { state: 'received', created_at: '2026-10-11T10:00:00Z' }, brief: { action: 'close' } }
  assert.deepEqual(cardExceptions(item, now).map(issue => issue.code), ['prep_failed', 'command_stuck', 'evidence_stale', 'looks_done'])
  assert.deepEqual(cardExceptions({}, now).map(issue => issue.code), ['evidence_unknown'])
  assert.equal(cardExceptions({ source_updated_at: '2026-10-11T11:00:00Z', prep: { status: 'running' } }, now).length, 0)
  assert.deepEqual(cardExceptions({ source_updated_at: '2026-10-11T11:00:00Z', aries_task: { status: 'interrupted' }, prep: { status: 'queued', at: '2026-10-11T06:00:00Z' } }, now).map(issue => issue.code), ['aries_failed', 'prep_stuck'])
})

test('a queued receipt never claims application or delivery', () => {
  assert.equal(commandReceiptText({ state: 'queued', operation: 'assign' }), 'Queued for Aries · assign')
  assert.equal(commandReceiptText({ state: 'received', operation: 'prep' }), 'Received by Aries · prep')
  assert.match(commandReceiptText({ state: 'failed', detail: 'Runner unavailable' }), /Failed: Runner unavailable/)
})

test('bulk plan freezes affected values, excludes completed cards, and duplicate review only adds a note', () => {
  const rows = [{ id: 1, title: 'Scope', assignee: 'mark', status: 'open' }, { id: 2, status: 'done' }]
  const plan = bulkActionPlan(rows, new Set(['1', '2']), 'assign', 'frank')
  assert.equal(plan.length, 1)
  rows[0].assignee = 'steve'
  assert.equal(plan[0].before.assignee, 'mark')
  const review = bulkActionPlan(rows, new Set(['1']), 'duplicate-review', '')[0]
  assert.equal(review.payload.operation, 'note')
  assert.match(review.payload.note, /before changing or closing/)
  assert.throws(() => bulkActionPlan(rows, new Set(['1']), 'delete', ''), /not supported/)
})

test('bulk undo requires the exact applied receipt and current unchanged value', () => {
  const entry = { id: 1, command_id: 22, operation: 'assign', value: 'frank', before: { assignee: 'mark' } }
  const item = { id: 1, assignee: 'frank', command_receipt: { id: 22 } }
  assert.equal(bulkUndoPayload(entry, item, { id: 22, state: 'queued' }), null)
  assert.equal(bulkUndoPayload(entry, item, { id: 21, state: 'applied' }), null)
  assert.deepEqual(bulkUndoPayload(entry, item, { id: 22, state: 'applied' }), { id: 1, operation: 'assign', value: 'mark', expected: { command_id:22, assignee:'frank', due:'', status:'open' } })
  assert.equal(bulkUndoPayload(entry, { ...item, assignee: 'steve' }, { id: 22, state: 'applied' }), null)
  assert.equal(bulkUndoPayload(entry, { ...item, command_receipt: { id: 23 } }, { id: 22, state: 'applied' }), null)
  const snooze = { id: 1, command_id: 22, operation: 'snooze', value: '2026-10-18', before: { status: 'open', due: '' } }
  const snoozed = { id: 1, status: 'snoozed', due: '2026-10-18' }
  assert.equal(bulkUndoPayload(snooze, snoozed, { id: 22, state: 'applied' }), null)
  assert.equal(bulkUndoPayload({ ...snooze, before: { status: 'snoozed', due: '2026-10-15' } }, snoozed, { id: 22, state: 'applied' }).value, '2026-10-15')
})

test('refresh retains card object identity for bound handlers but removes obsolete fields', () => {
  const item = { id: 1, assignee: 'mark', prep: { status: 'running' } }
  const rows = reconcileBoardItems([item], [{ id: 1, assignee: 'frank' }, { id: 2, title: 'New task' }])
  assert.equal(rows[0], item)
  assert.equal(item.assignee, 'frank')
  assert.equal('prep' in item, false)
  assert.equal(rows.length, 2)
})

test('upgraded served script remains parseable and offers non-destructive bulk choices', () => {
  const scripts = [...APP_HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  for (const script of scripts) assert.doesNotThrow(() => new Function(script[1]))
  assert.match(APP_HTML, /id="show-exceptions"/)
  assert.match(APP_HTML, /id="detail-dialog"/)
  assert.match(APP_HTML, /id="bulk-preview"/)
  assert.match(APP_HTML, /reconcileChildren\(board,nodes\)/)
  assert.match(APP_HTML, /data-task-id/)
})
