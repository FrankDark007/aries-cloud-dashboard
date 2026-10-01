import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { taskFailure } from '../src/mission-state.js'
import { MISSION_HTML } from '../src/mission-ui.js'

test('recent activity stays Running even when the status event is older',()=>{
  const source=MISSION_HTML.slice(MISSION_HTML.indexOf('function taskInfo('),MISSION_HTML.indexOf('function taskHtml('))
  const context=vm.createContext({taskFailure,mins:t=>t==='recent'?1:120,dur:m=>`${m} minutes`,fix:t=>t})
  vm.runInContext(source,context)
  const info=context.taskInfo({id:'C31',updated:'recent',data:{status:'running',status_source:'progress log and master plan',source_updated:'old',activity_updated:'recent',title:'Guard'}})
  assert.equal(info.word,'Running')
  assert.equal(info.t,'recent')
})
