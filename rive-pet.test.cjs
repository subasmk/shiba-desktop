const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const R=require('./rive-pet.js');
test('Ria maps only the four real clips and keeps missing art quiet',()=>{
 for(const n of ['walk','run','leap','drag'])assert.equal(R.mapState(n),'walk');
 for(const n of ['wave','landing','bow'])assert.equal(R.mapState(n),'wave');
 for(const n of ['celebrate','cheer','react-success','react-idea'])assert.equal(R.mapState(n),'cheer');
 for(const n of ['sleep','sit','rage','thinking','listening','touch-head','missing'])assert.equal(R.mapState(n),'idle');
});
test('embedded Rive bytes match the exported source',()=>{
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('relay-girl-riv.js','utf8'),ctx);
 const a=Buffer.from(ctx.window.RELAY_GIRL_RIV_B64,'base64');assert.equal(a.subarray(0,4).toString(),'RIVE');
 assert.deepEqual(a,fs.readFileSync('relay-girl.riv'));
});
test('Ria has an independent identity and voice without changing Rex or Dex',()=>{
 const {resolveVoice,DEFAULTS}=require('./assistant-voice.cjs');const {petIdentity}=require('./banter.cjs');
 assert.equal(petIdentity('girl').name,'Ria');assert.equal(petIdentity('rex').name,'Rex');assert.equal(petIdentity('dex').name,'Dex');
 assert.deepEqual(resolveVoice({},'girl'),{sid:0,speed:1});
 assert.deepEqual(DEFAULTS.rex,{sid:16,speed:1});assert.deepEqual(DEFAULTS.dex,{sid:7,speed:1.12});
 const s={voiceByMascot:{dex:{sid:21},girl:{sid:3}}};assert.equal(resolveVoice(s,'girl').sid,3);assert.equal(resolveVoice(s,'dex').sid,21);
 const {resolveFishVoice}=require('./fish-voice.cjs');assert.equal(resolveFishVoice({fishVoiceByMascot:{girl:'ria-id',dex:'dex-id'}},'girl'),'ria-id');
});
