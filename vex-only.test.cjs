const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const manifest=require('./manifest.json'),{resolveSprite,resolveEvent,VEX_EVENTS}=require('./mascot-anims.cjs');
const has=n=>Array.isArray(manifest[n]);
test('Daru-only manifest cells fit the sole atlas',()=>{
 const png=fs.readFileSync(__dirname+'/6-sprites-vex.png'),w=png.readUInt32BE(16),h=png.readUInt32BE(20);
 assert.equal(Object.keys(manifest).length,29);
 for(const [name,frames] of Object.entries(manifest)){assert.ok(name.startsWith('vex-'));assert.ok(frames.length);for(const f of frames){assert.ok(f.x>=0&&f.y>=0&&f.x+320<=w&&f.y+320<=h,name);assert.ok(f.ms>0);}}
});
test('every Daru event resolves to existing art',()=>{for(const event of Object.keys(VEX_EVENTS))assert.ok(has(resolveEvent(event,'vex',has)),event);for(const state of ['idle','walk','drag','landing','falling','drop','sit','sleep','talk','listening','touch-head','touch-body','touch-paws','touch-scare','screenpunch'])assert.ok(has(resolveSprite(state,'vex',has)),state);});
test('retired mascot art and player are absent from the app',()=>{for(const n of ['1-sprites-clean.png','3-sprites-dex.png','4-sprites-dex2.png','5-sprites-hit.png','cat-head.png','ria-head.png','relay-girl.riv','rive-pet.js','rive-canvas.js'])assert.equal(fs.existsSync(__dirname+'/'+n),false,n);const html=fs.readFileSync(__dirname+'/index.html','utf8');assert.ok(!html.includes('rive-pet'));});
test('dashboard has no retired mascot choices or voice pickers',()=>{const s=fs.readFileSync(__dirname+'/dashboard.js','utf8');for(const token of ['data-mascot=','data-ria-anim=','v-voice-rex','v-voice-dex','v-voice-girl','v-fish-rex','v-fish-dex','v-fish-girl'])assert.ok(!s.includes(token),token);assert.ok(s.includes('v-voice-vex'));assert.ok(s.includes('v-fish-vex'));});
