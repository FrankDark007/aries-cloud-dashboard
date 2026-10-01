import assert from 'node:assert/strict'
import test from 'node:test'
import { missionRequest } from '../src/mission.js'

test('mission feed keeps reads behind Access and writes behind the dedicated bearer', async()=>{
  let writes=0
  const env={MISSION_TOKEN:'mission-test-only',DB:{prepare(){return {bind(){return this},async run(){writes++},async all(){return {results:[]}}}}}}
  const req=(host,path,init={})=>new Request('https://'+host+path,init)
  assert.equal((await missionRequest(req('aries.flood.doctor','/api/mission'),env,false)).status,403)
  assert.equal((await missionRequest(req('aries-publish.flood.doctor','/api/mission'),env,true)).status,403)
  assert.equal((await missionRequest(req('aries.flood.doctor','/api/mission'),env,true)).status,200)
  for(const token of ['', 'Bearer publisher-test-only']) {
    assert.equal((await missionRequest(req('aries-publish.flood.doctor','/api/mission/push',{method:'POST',headers:{authorization:token},body:'{}'}),env,false)).status,401)
  }
  const post=data=>missionRequest(req('aries-publish.flood.doctor','/api/mission/push',{method:'POST',headers:{authorization:'Bearer mission-test-only'},body:JSON.stringify(data)}),env,false)
  assert.equal((await post({kind:'task',id:'C13',data:{status:'done'}})).status,200)
  assert.equal((await post({kind:'task',id:'C13',data:{status:'imaginary'}})).status,400)
  assert.equal((await post({kind:'task',id:'../secret',data:{status:'done'}})).status,400)
  assert.equal(writes,1)
})
