import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { SqliteD1 } from './sqlite-d1.js'
import { receiveCommands, claimCommands, acknowledgeDelivery, commandReceipts, retryCommand } from '../src/command-queue.js'

async function seed(db, operation = 'assign') {
  const r = await db.prepare(`INSERT INTO command_queue(operation,item_id,value,actor_email,created_at) VALUES(?,81,?,'teammate@example.test',?)`).bind(operation, operation === 'assign' ? 'mark' : null, new Date().toISOString()).run()
  return r.meta.last_row_id
}

test('delivery migration is additive and preserves queued, applied and failed history', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE command_queue(id INTEGER PRIMARY KEY,state TEXT,acked_at TEXT,ack_detail TEXT); INSERT INTO command_queue VALUES(1,'queued',NULL,NULL),(2,'applied','2026-01-01','done'),(3,'failed','2026-01-02','oops')`)
  db.exec(readFileSync(new URL('../migrations/0013_command_delivery.sql', import.meta.url),'utf8'))
  assert.deepEqual(db.prepare('SELECT state,attempts FROM command_queue ORDER BY id').all().map(r=>({...r})), [{state:'queued',attempts:0},{state:'applied',attempts:0},{state:'failed',attempts:0}])
  db.close()
})

test('legacy publisher receives original shape and receipt advances only once until acknowledgement', async () => {
  const db = new SqliteD1(); const id = await seed(db)
  assert.equal((await commandReceipts(db))[0].state,'queued')
  const commands = await receiveCommands(db,50)
  assert.deepEqual(Object.keys(commands[0]),['id','operation','item_id','note','value','actor_email','created_at'])
  assert.equal((await commandReceipts(db))[0].state,'received')
  assert.equal((await receiveCommands(db,50)).length,0)
  assert.equal((await commandReceipts(db))[0].attempts,1)
  assert.equal((await claimCommands(db,50)).length,0,'do not race a legacy worker already processing')
  assert.equal((await acknowledgeDelivery(db,id,'applied','Saved',undefined)).ok,true)
  assert.equal((await commandReceipts(db))[0].state,'applied')
  assert.equal((await receiveCommands(db,50)).length,0)
  db.close()
})

test('atomic claims are exclusive, exclude legacy polling and fence acknowledgements', async () => {
  const db = new SqliteD1(); await seed(db)
  const [a,b] = await Promise.all([claimCommands(db,50),claimCommands(db,50)])
  assert.equal(a.length+b.length,1)
  const command = (a[0]||b[0])
  assert.equal(command.idempotency_key,'command-1')
  assert.equal((await commandReceipts(db))[0].state,'processing')
  assert.equal((await receiveCommands(db,50)).length,0)
  assert.equal((await acknowledgeDelivery(db,command.id,'applied',null,'old-token')).status,409)
  assert.equal((await acknowledgeDelivery(db,command.id,'applied',null,command.lease_token)).ok,true)
  db.close()
})

test('expired leases stop in dead-letter state and only explicit bounded retry requeues them', async () => {
  const db = new SqliteD1(); await seed(db)
  const [claimed] = await claimCommands(db,1)
  db.raw.prepare("UPDATE command_queue SET lease_expires_at='2000-01-01T00:00:00.000Z'").run()
  const [receipt] = await commandReceipts(db)
  assert.equal(receipt.state,'failed'); assert.equal(receipt.dead_letter,true); assert.equal(receipt.error_code,'lease_expired')
  assert.equal((await receiveCommands(db,50)).length,0)
  assert.equal((await retryCommand(db,1)).ok,true)
  const [again] = await claimCommands(db,1)
  assert.equal(again.id,claimed.id); assert.equal(again.attempt,2); assert.notEqual(again.lease_token,claimed.lease_token)
  assert.equal((await acknowledgeDelivery(db,1,'applied',null,claimed.lease_token)).status,409)
  assert.equal((await acknowledgeDelivery(db,1,'failed','Temporary failure',again.lease_token)).ok,true)
  assert.equal((await retryCommand(db,1)).status,429)
  db.raw.prepare("UPDATE command_queue SET attempts=5,next_attempt_at=NULL").run()
  assert.equal((await retryCommand(db,1)).status,409)
  db.close()
})

test('legacy deliveries time out visibly rather than repeating an unacknowledged action',async()=>{
  const db=new SqliteD1(); await seed(db)
  await receiveCommands(db,1)
  db.raw.exec("UPDATE command_queue SET lease_expires_at='2000-01-01T00:00:00Z'")
  const [receipt]=await commandReceipts(db)
  assert.equal(receipt.state,'failed')
  assert.equal(receipt.error_code,'lease_expired')
  assert.equal((await receiveCommands(db,1)).length,0)
  assert.equal((await acknowledgeDelivery(db,1,'applied',null,undefined)).status,404)
  db.close()
})
