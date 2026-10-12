import assert from 'node:assert/strict'
import test from 'node:test'
import { curateCardMetadata, enrichBoardItems } from '../src/card-data.js'
import { claimGroupDetails, claimGroups } from '../src/claim-groups.js'

test('source contradictions are visible and survive a curated publish/read round trip', () => {
  const source = {
    id: 12, title: 'PetSmart marketing promotion', identity: { claim_id: 'CL-100' },
    source_context: { subject: 'Work authorisation routing', client: 'Client A', claim: 'CL-100' },
    brief: { client: 'Client B', claim: 'CL-200', identity: { claim_id: 'CL-200' } },
  }
  const curated = curateCardMetadata(source)
  assert.equal(curated.quality.status, 'review')
  assert.deepEqual(curated.quality.issues.map(issue => issue.code).sort(),
    ['claim_mismatch', 'client_mismatch', 'conflicting_claim_id', 'title_subject_mismatch'])
  const stored = { id: source.id, title: source.title, ...curated }
  assert.deepEqual(curateCardMetadata(stored).quality, curated.quality)
  assert.equal(source.identity.claim_id, 'CL-100', 'original evidence is never overwritten')
})

test('missing evidence and ambiguous prose never become a zero balance or inferred payment', () => {
  const metadata = curateCardMetadata({ brief: { amount: '$12,400 issued, still unpaid' } })
  assert.deepEqual(metadata.financials, [])
  assert.equal(metadata.quality.status, 'unverified')
  assert.equal(metadata.identity.claim_id, null)
})

test('structured financial facts retain their distinct states, source, date and valid zero', () => {
  const make = (type, amount_minor) => ({ type, amount_minor, currency: 'usd', source: 'Invoice 115224', date: '2026-10-01' })
  const metadata = curateCardMetadata({ financials: [
    make('invoice_total', 150000), make('outstanding_balance', 0), make('payment_issued', 120000),
    make('payment_received', 100000), make('contractor_paid', 0), make('claimed_cumulative_payment', 110000),
  ] })
  assert.equal(metadata.financials.length, 6)
  assert.equal(metadata.financials[1].amount_minor, 0)
  assert.equal(metadata.financials[2].type, 'payment_issued')
  assert.equal(metadata.financials[3].type, 'payment_received')
  assert.equal(metadata.financials[0].currency, 'USD')
  assert.equal(metadata.financials[0].date, '2026-10-01')
})

test('untyped, fractional, unsourced and impossible-date financial entries are flagged', () => {
  const valid = { type: 'invoice_total', amount_minor: 0, currency: 'USD', source: 'Invoice 1', date: '2026-02-30' }
  const metadata = curateCardMetadata({ financials: [valid, { ...valid, source: '' }, { ...valid, amount_minor: 1.5 }, { ...valid, type: 'money' }] })
  assert.equal(metadata.financials.length, 1)
  assert.equal(metadata.financials[0].date, null)
  assert.equal(metadata.quality.status, 'review')
  assert.ok(metadata.quality.issues.some(issue => issue.code === 'invalid_financial_entry'))
  assert.ok(metadata.quality.issues.some(issue => issue.code === 'invalid_financial_date'))
})

test('responsibility distinguishes owner, next actor and waiting party with provenance', () => {
  const metadata = curateCardMetadata({ assignee: 'Mark', brief: {
    next_step: 'Frank: approve the response.', waiting_on: 'Abbey and Lacey', owner_hint: 'Steve',
  } })
  assert.equal(metadata.responsibility.owner, 'Mark')
  assert.equal(metadata.responsibility.next_actor, 'Frank')
  assert.equal(metadata.responsibility.waiting_on, 'Abbey and Lacey')
  assert.equal(metadata.responsibility.provenance.next_actor, 'brief.next_step_prefix')
  const [unassigned] = enrichBoardItems([{ ...metadata, assignee: null }])
  assert.equal(unassigned.responsibility.owner, null, 'unassignment cannot retain the previous structured owner')
  assert.equal(curateCardMetadata({ brief: { owner_hint: 'Steve' } }).responsibility.owner, null)
})

test('confirmed relationships remain separate from suggestions and retain both source cards', () => {
  const source = [
    { id: 1, status: 'open', relationships: { supersedes: [2, 2, 1, -4], duplicate_of: 3,
      suggestions: [{ type: 'duplicate', card_id: 4, reason: 'Similar subject, needs review' }] } },
    { id: 2, status: 'done' },
  ]
  const result = enrichBoardItems(source)
  assert.equal(result.length, 2)
  assert.deepEqual(result[0].relationships.supersedes, [2])
  assert.equal(result[0].relationships.duplicate_of, 3)
  assert.equal(result[0].relationships.suggestions[0].card_id, 4)
  assert.equal(result[1].status, 'done')
  assert.deepEqual(source[0].relationships.supersedes, [2, 2, 1, -4])
})

test('relationship cycles are visible without deleting or consolidating cards', () => {
  const result = enrichBoardItems([
    { id: 1, relationships: { superseded_by: 2 } },
    { id: 2, relationships: { superseded_by: 3 } },
    { id: 3, relationships: { superseded_by: 1 } },
  ])
  assert.equal(result.length, 3)
  assert.ok(result.every(item => item.quality.issues.some(issue => issue.code === 'relationship_cycle')))
  const mixed = enrichBoardItems([
    { id: 1, relationships: { supersedes: [2], duplicate_of: 3 } },
    { id: 2, relationships: { supersedes: [1] } },
    { id: 3 },
  ])
  assert.ok(mixed[0].quality.issues.some(issue => issue.code === 'relationship_cycle'))
  assert.ok(mixed[1].quality.issues.some(issue => issue.code === 'relationship_cycle'))
  assert.equal(mixed[2].quality.status, 'unverified')
})

const card = (id, claim_id, client_id = 'client-1') => ({
  id, status: 'open', brief: { client: 'Linda Pickering' }, identity: { claim_id, client_id },
})

test('canonical claim keys stay stable as tasks are closed, added or reordered', () => {
  const first = claimGroups([card(1, 'CL-100'), card(2, 'cl100')])
  const changed = claimGroups([card(9, 'CL-100'), card(2, 'cl100'), { ...card(1, 'CL-100'), status: 'done' }])
  assert.equal(first.get(1).key, changed.get(9).key)
  assert.equal(first.get(1).key, 'claim_id:cl100')
  assert.match(first.get(1).reason, /explicit claim id/)
})

test('matching display names never merge conflicting explicit claims or clients', () => {
  const { groups, conflicts } = claimGroupDetails([card(1, 'CL-100'), card(2, 'CL-200'), card(3, 'CL-100', 'client-2')])
  assert.equal(groups.size, 0)
  assert.ok(conflicts.get(1).some(entry => entry.field === 'claim_id'))
  assert.ok(conflicts.get(1).some(entry => entry.field === 'client_id'))
})

test('an unidentified third card cannot bridge incompatible explicit claims', () => {
  const { groups } = claimGroupDetails([card(1, 'CL-100'), { id: 2, status: 'open', brief: { client: 'Linda Pickering' } }, card(3, 'CL-200')])
  assert.notEqual(groups.get(1)?.key, groups.get(3)?.key)
})

test('one explicit claim can contain multiple invoices without losing its canonical key', () => {
  const groups = claimGroups([
    { ...card(1, 'CL-100'), identity: { claim_id: 'CL-100', invoice_id: 'INV1' } },
    { ...card(2, 'CL-100'), identity: { claim_id: 'CL-100', invoice_id: 'INV2' } },
  ])
  assert.equal(groups.get(1).key, 'claim_id:cl100')
  assert.equal(groups.get(2).key, 'claim_id:cl100')
})
