import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const source = fs.readFileSync(new URL('../scenarios.js', import.meta.url), 'utf8')
const scenario = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const mission = fs.readFileSync(new URL('../mission.js', import.meta.url), 'utf8').replace(/^import .*\n/, '').split("byId('next').onclick=")[0]
const context = vm.createContext({...scenario, assert})
vm.runInContext(mission + `
assert.equal(tickets.length,100)
assert.equal(new Set(tickets.map(t=>t.id)).size,100)
let count=0
for(current=0;current<tickets.length;current++){
  assert.equal(rows().length,2)
  assert.ok(actions.includes(bestAction()))
  assert.ok(actions.includes(botCall().action))
  for(const phase of ['before','after'])assert.ok(configPreview(ticket(),phase).length)
  for(const action of actions)for(const checks of [new Set(),new Set(['diff']),new Set(['a','b']),new Set(['restore'])]){
    const plain=score(action,checks,false),staked=score(action,checks,true)
    assert.ok(Number.isFinite(plain.points))
    assert.equal(staked.points-plain.points,plain.correct?3:-3)
    assert.equal(plain.correct,action===bestAction())
    if(!plain.correct)assert.equal(plain.support,0)
    count++
  }
}
assert.equal(count,1200)
`, context)
console.log('PASS: 100 unique duel tickets and 1,200 scoring combinations')
