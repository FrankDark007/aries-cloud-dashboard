// Durable delivery metadata complements the existing command ID and terminal state.
// Legacy GET consumers report receipt. POST consumers additionally use a fenced lease.
const MAX_ATTEMPTS = 5
const LEASE_SECONDS = 300

/** @param {any} row @param {number} [now] */
export function commandReceipt(row, now = Date.now()) {
  const expired = row.state === 'queued' && row.lease_expires_at && Date.parse(row.lease_expires_at) <= now
  const state = expired ? 'failed' : row.state !== 'queued' ? row.state : row.lease_token ? 'processing' : row.received_at ? 'received' : 'queued'
  const age = Math.max(0, now - Date.parse(row.created_at))
  return { id: row.id, item_id: row.item_id, operation: row.operation, state,
    created_at: row.created_at, received_at: row.received_at || null, acked_at: row.acked_at || null,
    attempts: row.attempts || 0, lease_expires_at: row.lease_expires_at || null,
    next_attempt_at: row.next_attempt_at || null,
    error_code: expired ? 'lease_expired' : row.error_code || null,
    detail: expired ? 'Processing lease expired. Check the source before retrying.' : row.ack_detail || null,
    stuck: ['queued', 'received', 'processing'].includes(state) && age > LEASE_SECONDS * 1000,
    dead_letter: state === 'failed', retry_allowed: state === 'failed' && (row.attempts || 0) < MAX_ATTEMPTS }
}

/** @param {D1Database} db @param {string} [now] */
export async function expireLeases(db, now = new Date().toISOString()) {
  // Timeout is terminal, not an automatic replay of a potentially external side effect.
  await db.prepare(`UPDATE command_queue SET state = 'failed', error_code = 'lease_expired',
    ack_detail = 'Processing lease expired. Check the source before retrying.', acked_at = ?
    WHERE state = 'queued' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`).bind(now, now).run()
}

/** @param {D1Database} db */
export async function commandReceipts(db) {
  await expireLeases(db)
  const rows = await db.prepare(`SELECT * FROM command_queue ORDER BY id DESC LIMIT 1000`).all()
  return rows.results.map(row => commandReceipt(row))
}

/** @param {D1Database} db @param {number} limit */
export async function receiveCommands(db, limit) {
  await expireLeases(db)
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString()
  const rows = await db.prepare(`UPDATE command_queue SET received_at = ?, lease_expires_at = ?, attempts = attempts + 1
    WHERE id IN (SELECT id FROM command_queue WHERE state = 'queued' AND lease_token IS NULL
      AND received_at IS NULL AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY id ASC LIMIT ?) AND state = 'queued' AND received_at IS NULL RETURNING *`
  ).bind(now, expires, MAX_ATTEMPTS, now, limit).all()
  return rows.results.map((/** @type {any} */ row) => ({ id: row.id, operation: row.operation, item_id: row.item_id,
    note: row.note, value: row.value, actor_email: row.actor_email, created_at: row.created_at }))
}

/** @param {D1Database} db @param {number} limit @param {number} seconds */
export async function claimCommands(db, limit, seconds = LEASE_SECONDS) {
  await expireLeases(db)
  const now = new Date().toISOString(), expires = new Date(Date.now() + seconds * 1000).toISOString()
  const token = crypto.randomUUID()
  // Selection and update are a single SQLite statement. Concurrent workers cannot claim the same row.
  const rows = await db.prepare(`UPDATE command_queue SET lease_token = ?, lease_expires_at = ?,
    received_at = ?, attempts = attempts + 1
    WHERE id IN (SELECT id FROM command_queue WHERE state = 'queued' AND lease_token IS NULL
      AND received_at IS NULL AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY id ASC LIMIT ?) AND state = 'queued' AND lease_token IS NULL RETURNING *`
  ).bind(token, expires, now, MAX_ATTEMPTS, now, limit).all()
  return rows.results.map((/** @type {any} */ row) => ({ id: row.id, operation: row.operation, item_id: row.item_id,
    note: row.note, value: row.value, actor_email: row.actor_email, created_at: row.created_at,
    lease_token: token, lease_expires_at: expires, attempt: row.attempts, idempotency_key: 'command-' + row.id }))
}

/** @param {D1Database} db @param {number} id @param {string} status @param {string|null} detail @param {unknown} token */
export async function acknowledgeDelivery(db, id, status, detail, token) {
  await expireLeases(db)
  const row = /** @type {any} */ (await db.prepare('SELECT * FROM command_queue WHERE id = ?').bind(id).first())
  if (!row || row.state !== 'queued') return { error: 'Command not found', status: 404 }
  if (row.lease_token && row.lease_token !== token) return { error: 'Processing lease does not match', status: 409 }
  const now = new Date().toISOString()
  const retryAt = status === 'failed' ? new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.max(0, Number(row.attempts || 1) - 1)) * 1000).toISOString() : null
  const result = await db.prepare(`UPDATE command_queue SET state = ?, ack_detail = ?, acked_at = ?,
    error_code = ?, next_attempt_at = ? WHERE id = ? AND state = 'queued'
    AND (lease_token IS NULL OR lease_token = ?)`).bind(status, detail, now, status === 'failed' ? 'consumer_failed' : null, retryAt, id, token || null).run()
  if (result.meta.changes !== 1) return { error: 'Command changed before acknowledgement', status: 409 }
  return { ok: true, id, status, acked_at: now }
}

/** @param {D1Database} db @param {number} id */
export async function retryCommand(db, id) {
  await expireLeases(db)
  const row = /** @type {any} */ (await db.prepare('SELECT * FROM command_queue WHERE id = ?').bind(id).first())
  if (!row) return { error: 'Command not found', status: 404 }
  if (row.state !== 'failed') return { error: 'Only failed commands can be retried', status: 409 }
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) return { error: 'Retry limit reached. Resolve this command at its source.', status: 409 }
  const now = new Date().toISOString()
  if (row.next_attempt_at && String(row.next_attempt_at) > now) return { error: 'Retry is backing off', status: 429, next_attempt_at: row.next_attempt_at }
  const result = await db.prepare(`UPDATE command_queue SET state = 'queued', received_at = NULL,
    lease_token = NULL, lease_expires_at = NULL, error_code = NULL, acked_at = NULL, ack_detail = NULL,
    next_attempt_at = NULL WHERE id = ? AND state = 'failed' AND attempts < ?`).bind(id, MAX_ATTEMPTS).run()
  if (result.meta.changes !== 1) return { error: 'Command changed before retry', status: 409 }
  return { ok: true, receipt: commandReceipt({ ...row, state: 'queued', received_at: null, lease_token: null,
    lease_expires_at: null, error_code: null, acked_at: null, ack_detail: null, next_attempt_at: null }) }
}
