const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const s=require('./tamil-setup.cjs');
test('pins are full sha256 hex strings',()=>{a.match(s.MODEL_SHA256,/^[0-9a-f]{64}$/);a.match(s.BUNDLE_SHA256,/^[0-9a-f]{64}$/);});
test('tokensFromConfig builds token lines and rejects bad configs',()=>{
 const cfg={phoneme_type:'espeak',espeak:{voice:'ta'},phoneme_id_map:{'a':[12],'அ':[45]}};
 a.equal(s.tokensFromConfig(cfg),'a 12\nஅ 45\n');
 a.throws(()=>s.tokensFromConfig({phoneme_type:'espeak',espeak:{voice:'en'},phoneme_id_map:{}}),/unrecognized/i);
 a.throws(()=>s.tokensFromConfig({phoneme_type:'pinyin',espeak:{voice:'ta'},phoneme_id_map:{}}),/unrecognized/i);
 a.throws(()=>s.tokensFromConfig({phoneme_type:'espeak',espeak:{voice:'ta'}}),/phoneme map/i);
});
test('metadata protobuf append parses back exactly',()=>{
 const buf=Buffer.concat([Buffer.from('fake-onnx-bytes'),...[['model_type','vits'],['comment','piper'],['language','Tamil'],['voice','ta'],['has_espeak','1'],['n_speakers','1'],['sample_rate','22050'],['url','u'],['maintainer','m']].map(([k,v])=>s.metaEntry(k,v))]);
 const back=s.parseLastMeta(buf);
 a.ok(back.some(([k,v])=>k==='language'&&v==='Tamil'));
 a.ok(back.some(([k,v])=>k==='sample_rate'&&v==='22050'));
 a.equal(s.parseLastMeta(Buffer.from('garbage-without-tail')).length,0);
});
test('readiness helpers reflect the folder contents',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ta-test-'));
 a.equal(s.tamilVoiceReady(dir),false);
 fs.writeFileSync(path.join(dir,s.MODEL_FILE),'x');fs.writeFileSync(path.join(dir,s.TOKENS_FILE),'x');
 a.equal(s.modelReady(dir),true);a.equal(s.phonemizerReady(dir),false);a.equal(s.tamilVoiceReady(dir),false);
 fs.mkdirSync(path.join(dir,'piper-phonemize'));
 for(const f of s.PHONEMIZER_FILES)fs.writeFileSync(path.join(dir,'piper-phonemize',f),'x');
 a.equal(s.tamilVoiceReady(dir),true);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('prepareTamilVoice short-circuits when everything is ready',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ta-test-'));
 fs.writeFileSync(path.join(dir,s.MODEL_FILE),'x');fs.writeFileSync(path.join(dir,s.TOKENS_FILE),'x');
 fs.mkdirSync(path.join(dir,'piper-phonemize'));
 for(const f of s.PHONEMIZER_FILES)fs.writeFileSync(path.join(dir,'piper-phonemize',f),'x');
 const r=await s.prepareTamilVoice(dir);
 a.deepEqual(r,{ok:true,already:true});
 fs.rmSync(dir,{recursive:true,force:true});
});
