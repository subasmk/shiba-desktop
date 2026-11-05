const test=require('node:test'),assert=require('node:assert/strict');
const {parseRoutine,saveRoutine,deleteRoutine,listRoutines}=require('./routines.cjs');
const {parseHistoryQuery,statusAnswer,PetHistory}=require('./pet-history.cjs');
test('parseHistoryQuery detects counts in English and Tanglish',()=>{
 assert.equal(parseHistoryQuery('how many apps did I open?'),'app-open');
 assert.equal(parseHistoryQuery('ethana app open pannen?'),'app-open');
 assert.equal(parseHistoryQuery('evlo times I touched you'),'touches');
 assert.equal(parseHistoryQuery('what did I do today?'),'all');
 assert.equal(parseHistoryQuery('enna pannen?'),'all');
 assert.equal(parseHistoryQuery('open notepad'),null);
 assert.equal(parseHistoryQuery('hello bro'),null);
});
test('statusAnswer reports only real counts, honest zeros',()=>{
 const h=new PetHistory();h.record('app-open');h.record('app-open');h.record('touch-head');
 assert.match(statusAnswer('app-open',h.counts),/2 apps/);
 assert.match(statusAnswer('touches',h.counts),/1 times/);
 assert.match(statusAnswer('drag',h.counts),/0/);
 const empty=statusAnswer('app-open',{});
 assert.match(empty,/not opened any app/i);
 assert.ok(!/five|5/.test(empty));
});
test('routines: save/list/delete with validation',()=>{
 const s={};
 assert.throws(()=>saveRoutine(s,'',[]));
 assert.throws(()=>saveRoutine(s,'morning',[]));
 saveRoutine(s,'Morning',[' Notepad ','Calculator','Notepad']);
 const l=listRoutines(s);
 assert.deepEqual(l,[{name:'morning',apps:['Notepad','Calculator']}]);
 assert.equal(deleteRoutine(s,'morning'),true);
 assert.equal(listRoutines(s).length,0);
});
test('parseRoutine requires the word routine',()=>{
 assert.equal(parseRoutine('start morning routine'),'morning');
 assert.equal(parseRoutine('morning routine start pannu'),'morning');
 assert.equal(parseRoutine('start music'),null);
});
