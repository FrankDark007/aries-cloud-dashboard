import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { missionRequest } from '../src/mission.js'

function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE mission_records(kind TEXT,id TEXT,data TEXT,updated TEXT,PRIMARY KEY(kind,id))')
  const env = {
    MISSION_TOKEN:'test-only',
    DB:{prepare(sql){
      return {bind(...args){
        return {async run(){
          const r=db.prepare(sql).run(...args)
          return {meta:{changes:Number(r.changes)}}
        }}
      }}
    }}
  }
  const push = async data => (await missionRequest(new Request('https://aries-publish.flood.doctor/api/mission/push',{method:'POST',headers:{authorization:'Bearer test-only'},body:JSON.stringify({kind:'task',id:'T88',data})}),env,false)).json()
  const row = () => db.prepare('SELECT * FROM mission_records').get()
  return {db,push,row}
}
test('recent CLI push retains status, title and updated after stale backfill',async()=>{
  const {push,row}=fixture()
  await push({origin:'cli',status:'running',title:'Live task'})
  const before=row()
  const result=await push({origin:'backfill',source_updated:'2020-01-01T00:00:00Z',status:'stopped',title:'Stale title'})
  assert.deepEqual(row(),before)
  assert.equal(result.skipped,'newer cli push')
})
test('backfill source newer than stale CLI push can replace it',async()=>{
  const {db,push,row}=fixture()
  await push({origin:'cli',status:'running',title:'Old task'})
  db.exec("UPDATE mission_records SET updated='2020-01-01T00:00:00.000Z'")
  await push({origin:'backfill',source_updated:'2021-01-01T00:00:00Z',status:'done',title:'New evidence'})
  assert.equal(JSON.parse(row().data).status,'done')
})
test('backfill owned row keeps updating',async()=>{
  const {push,row}=fixture()
  await push({origin:'backfill',source_updated:'2020-01-01T00:00:00Z',status:'running',title:'First'})
  await push({origin:'backfill',source_updated:'2021-01-01T00:00:00Z',status:'done',title:'Second'})
  assert.equal(JSON.parse(row().data).title,'Second')
})
test('legacy recorder source protects CLI state and equality does not replace it',async()=>{
  const {db,push,row}=fixture()
  await push({status_source:'mission CLI',status:'running',title:'Legacy recorder'})
  db.exec("UPDATE mission_records SET updated='2021-01-01T00:00:00.000Z'")
  const before=row()
  await push({origin:'backfill',source_updated:'2021-01-01T01:00:00+01:00',status:'stopped',title:'Stale'})
  assert.deepEqual(row(),before)
})
test('backfill missing or invalid source time cannot replace CLI',async()=>{
  const {push,row}=fixture()
  await push({origin:'cli',status:'running',title:'Live'})
  const before=row()
  for(const source_updated of [null,'invalid']) {
    const result=await push({origin:'backfill',source_updated,status:'stopped',title:'Stale'})
    assert.deepEqual(row(),before)
    assert.equal(result.skipped,'newer cli push')
  }
})
