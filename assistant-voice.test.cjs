const test=require('node:test'),assert=require('node:assert/strict');
const {VOICES,DEFAULTS,MAX_SID,voiceKey,sanitizePref,resolveVoice}=require('./assistant-voice.cjs');
test('Daru voice catalog has unique valid speakers',()=>{assert.equal(new Set(VOICES.map(v=>v.sid)).size,VOICES.length);for(const v of VOICES)assert.ok(v.sid>=0&&v.sid<=MAX_SID&&v.label);});
test('Daru voice defaults to Puck',()=>assert.deepEqual(resolveVoice({},'vex'),{sid:18,speed:1}));
test('Daru saved voice wins',()=>assert.deepEqual(resolveVoice({voiceByMascot:{vex:{sid:11,speed:.9}}},'vex'),{sid:11,speed:.9}));
test('retired preferences never replace Daru preferences',()=>assert.deepEqual(resolveVoice({voiceByMascot:{dex:{sid:7}}},'vex'),DEFAULTS.vex));
test('invalid voice falls back and speed clamps',()=>{assert.deepEqual(sanitizePref({sid:999},DEFAULTS.vex),DEFAULTS.vex);assert.equal(sanitizePref({speed:99},DEFAULTS.vex).speed,1.5);assert.equal(sanitizePref({speed:.01},DEFAULTS.vex).speed,.6);});
test('stale mascot values normalize to Daru',()=>{for(const m of [undefined,'rex','dex','girl','vex'])assert.equal(voiceKey(m),'vex');});
test('garbage preferences safely default',()=>{for(const s of [null,{voiceByMascot:'bad'},{voiceByMascot:{vex:42}}])assert.deepEqual(resolveVoice(s,'vex'),DEFAULTS.vex);});
