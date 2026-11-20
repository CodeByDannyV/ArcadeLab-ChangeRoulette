import {catalog,evaluate,configPreview,botForecast,ticketTypes,rehearsals} from './scenarios.js'
const byId=id=>document.getElementById(id)
function node(tag,text){const el=document.createElement(tag);el.textContent=text;return el}
const families=['firewall','route','pzen','pac'].map(kind =>
  catalog.slice(1).filter(t => (t.network?.kind || 'firewall') === kind))
const tickets=[]
for(let i=0;i<60;i++){
  for(const family of families)if(family[i])tickets.push(family[i])
}
const key='roulette-campaign-duel-v1'
let current=0, extras=2, chip=true, shiftCount=0, playerTotal=0, botTotal=0
let records={}, seen=new Set(), locked=false, choice=null, stake=false
const ticket=()=>tickets[current]
const rows=()=>evaluate(ticket())
const kind=()=>ticket().network?.kind || 'firewall'
const actions=['Approve','Hold','Rollback']
function bestAction() {
  const results=rows()
  if(results.some(b=>b.intendedAccess && !b.after) && results.every(b=>!b.intendedAccess || b.before))return 'Rollback'
  if(results.every(b=>b.meetsIntent) && ticket().readiness.recovery<=ticket().readiness.tolerance)return 'Approve'
  return 'Hold'
}
function botCall() {
  const forecast=botForecast(ticket(),rows())
  const satisfies=rows().every(b=>(!forecast.lost.includes(b.id))===b.intendedAccess)
  const action=satisfies && forecast.risk!=='High'?'Approve':'Hold'
  return {action,reason:forecast.reasoning+' I recommend '+action.toLowerCase()+'.'}
}
function pathText(b,phase='after') {
  const path=b[phase]
  return b.name+' → '+(path || 'no service path')+' → '+(path?'reachable':'blocked')
}
function save(){
  try{
    localStorage.setItem(key,JSON.stringify({current,extras,chip,shiftCount,playerTotal,botTotal,records,seen:[...seen],locked,choice,stake}))
    byId('save-status').textContent='Progress saved on this browser.'
  }catch{byId('save-status').textContent='Browser storage is unavailable. Keep this tab open to retain progress.'}
}
function restore(){
  try{
    const saved=JSON.parse(localStorage.getItem(key))
    if(!saved || !Number.isInteger(saved.current) || !tickets[saved.current])return
    if(!Number.isInteger(saved.extras)||saved.extras<0||saved.extras>2||!Array.isArray(saved.seen))return
    current=saved.current;extras=saved.extras;chip=Boolean(saved.chip)
    shiftCount=saved.shiftCount||0;playerTotal=saved.playerTotal||0;botTotal=saved.botTotal||0
    records=saved.records||{};seen=new Set(saved.seen.filter(x=>['a','b','diff','restore'].includes(x)))
    locked=Boolean(saved.locked)&&actions.includes(saved.choice);choice=saved.choice;stake=Boolean(saved.stake)
  }catch{}
}
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns,'svg')
  svg.setAttribute('class','glyph')
  svg.setAttribute('aria-hidden','true')
  const use = document.createElementNS(ns,'use')
  use.setAttribute('href','#i-'+name)
  svg.append(use)
  return svg
}
function updateDiagram(){
  rows().forEach((b,i)=>{
    const tested=seen.has(i===0?'a':'b')
    const state=tested?(b.after?'reachable':'blocked'):'untested'
    byId('wire'+i).dataset.state=state
    byId('obs'+i).textContent=state[0].toUpperCase()+state.slice(1)
    byId('site'+i).textContent=b.name
  })
  byId('component').textContent={firewall:'Firewall',route:'Routing',pzen:'Proxy',pac:'PAC'}[kind()]
}
function inspect(check){
  if(check==='diff')return 'Current configuration\n'+configPreview(ticket(),'before')+'\nProposed configuration\n'+configPreview(ticket(),'after')
  if(check==='restore')return rows().map(b=>pathText(b,'before')).join('. ')
  const b=rows()[check==='a'?0:1]
  return pathText(b)+(b.afterReason?'. '+b.afterReason:'')
}
function renderChecks(){
  updateDiagram()
  byId('budget').textContent=(seen.size?'Another check costs one reserve.':'First check is free.')+' Shift reserves: '+extras+'.'
  byId('checks').replaceChildren()
  const labels={a:'Probe '+rows()[0].name,b:'Probe '+rows()[1].name,diff:'Read configuration diff',restore:'Rehearse rollback'}
  for(const [check,label] of Object.entries(labels)){
    const used=seen.has(check), free=seen.size===0
    const button=node('button',label+(used?' · checked':free?' · free':' · 1 reserve'))
    button.prepend(icon({a:'terminal',b:'headset',diff:'policy',restore:'restore'}[check]))
    button.disabled=locked || used || (!free && extras===0)
    button.onclick=()=>{
      if(locked || seen.has(check) || (seen.size && extras===0))return
      if(seen.size)extras--
      seen.add(check);renderChecks();save()
    }
    byId('checks').append(button)
  }
  byId('findings').replaceChildren(...[...seen].map(check=>{
    const item=node(check==='diff'?'pre':'p',inspect(check))
    return item
  }))
}
function hasEvidence(action,checks){
  if(checks.has('diff'))return true
  if(action==='Approve')return checks.has('a')&&checks.has('b')
  return rows().some((b,i)=>checks.has(i===0?'a':'b') && (action==='Rollback'?b.intendedAccess&&!b.after:!b.meetsIntent))
    || (action==='Hold' && ticket().readiness.recovery>ticket().readiness.tolerance)
}
function score(action,checks,doubled){
  const phase=action==='Rollback'?'before':'after', results=rows()
  const service=Number(results.every(b=>!b.intendedAccess || Boolean(b[phase])))
  const access=Number(results.every(b=>b.intendedAccess || !b[phase]))
  const correct=action===bestAction()
  const support=Number(correct && hasEvidence(action,checks))
  const bonus=doubled?(correct?3:-3):0
  return {phase,service,access,correct,support,bonus,points:service+access+(correct?2:0)+support+bonus}
}
function replay(who,action,result){
  const card=node('article','')
  card.append(node('h3',who+' · '+action),node('strong',{Hold:'Expansion paused; pilot retained',Approve:'Proposed configuration expanded',Rollback:'Prior configuration restored'}[action]))
  for(const b of rows()){
    const match=Boolean(b[result.phase])===b.intendedAccess
    const line=node('p',pathText(b,result.phase))
    line.className='result-line'+(match?'':' issue');line.prepend(icon(match?'match':'miss'))
    line.append(node('small',match?' · Intent met':' · Intent missed'));card.append(line)
  }
  card.append(node('small','Service '+result.service+'/1 · Access '+result.access+'/1 · Decision '+(result.correct?2:0)+'/2 · Evidence '+result.support+'/1 · Chip '+result.bonus),node('h3',result.points+' points'))
  byId('compare').append(card)
}
function reveal(){
  const record=records[ticket().id]
  byId('compare').replaceChildren()
  replay('You',record.action,record.you);replay('Change bot',record.bot,record.rival)
  byId('winner').textContent=record.you.points>record.rival.points?'You won the ticket.':record.you.points<record.rival.points?'The bot took this one.':'A tied ticket.'
  const best=bestAction()
  byId('lesson').textContent={Rollback:'An intended service path failed. Restore the baseline to recover service, then repair the proposed change.',Hold:'Pause expansion. Resolve the access mismatch or improve recovery readiness before proceeding.',Approve:'Both branch outcomes match intent and estimated recovery fits service tolerance.'}[best]
  const completed=Object.keys(records).length
  byId('totals').textContent=(completed===tickets.length?'Campaign complete. ':shiftCount===3?'Shift complete. ':'Shift so far. ')+'You '+playerTotal+' / Bot '+botTotal+' · '+completed+' of '+tickets.length+' tickets complete.'
  byId('next').hidden=completed===tickets.length
  byId('next').textContent=shiftCount===3?'Start the next shift':'Deal me another'
  byId('table').hidden=true;byId('reveal').hidden=false
}
function deal(){
  const t=ticket(), bot=botCall()
  byId('round').textContent=ticketTypes[kind()]+' · '+t.id+' · '+Object.keys(records).length+' / 100 complete'
  byId('title').textContent=t.title
  byId('intent').textContent=t.ticket+' '+rows().map(b=>b.name+' must '+(b.intendedAccess?'retain':'lose')+' access to '+t.destination+'.').join(' ')
  byId('readiness').textContent=rehearsals[t.readiness.rehearsal]+' · Recovery '+t.readiness.recovery+' min · Tolerance '+t.readiness.tolerance+' min'
  byId('call').textContent='“'+bot.action+'.”';byId('reason').textContent=bot.reason
  byId('chip').checked=false;byId('chip').disabled=!chip
  byId('moves').replaceChildren()
  for(const action of actions){
    const b=node('button',(action===bot.action?'Back bot · ':'Override · ')+action)
    b.onclick=()=>commit(action);byId('moves').append(b)
  }
  renderChecks();byId('table').hidden=false;byId('reveal').hidden=true
  if(locked)reveal()
}
function commit(action){
  if(locked)return
  locked=true;choice=action;stake=chip&&byId('chip').checked;if(stake)chip=false
  const bot=botCall(),you=score(action,seen,stake),rival=score(bot.action,new Set(),false)
  records[ticket().id]={action,bot:bot.action,you,rival}
  playerTotal+=you.points;botTotal+=rival.points;shiftCount++
  reveal();save();byId('winner').focus()
}
function select(index){
  current=index;locked=false;choice=null;stake=false;seen.clear()
  deal();save();byId('title').focus()
}
byId('next').onclick=()=>{
  if(!locked)return
  if(shiftCount===3){shiftCount=0;extras=2;chip=true}
  const next=tickets.findIndex((t,i)=>i>current && !records[t.id])
  const index=next<0?tickets.findIndex(t=>!records[t.id]):next
  if(index>=0)select(index)
}
function library(){
  const filter=byId('topic').value
  byId('ticket-list').replaceChildren()
  tickets.forEach((t,i)=>{
    if(records[t.id] || (filter && (t.network?.kind||'firewall')!==filter))return
    const button=node('button',t.id+' · '+t.title)
    button.onclick=()=>{extras=2;chip=true;shiftCount=0;byId('chooser').close();select(i)}
    byId('ticket-list').append(button)
  })
  if(!byId('ticket-list').children.length)byId('ticket-list').append(node('p','All tickets in this selection are complete.'))
}
byId('library').onclick=()=>{library();byId('chooser').showModal()}
byId('topic').onchange=library
byId('help').onclick=()=>byId('guide').showModal()
restore();deal()
try{if(!localStorage.getItem('full-duel-guide-v1'))byId('guide').showModal()}catch{}
byId('guide').onclose=()=>{try{localStorage.setItem('full-duel-guide-v1','1')}catch{}}
