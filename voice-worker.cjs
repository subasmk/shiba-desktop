// Private local inference process. Only fixed task types, fixed local model paths.
// ASR: native sherpa-onnx Whisper-tiny (works under the Electron runtime).
// TTS: sherpa-onnx WASM Kokoro-int8. The native sherpa TTS addon cannot return audio
// inside Electron 45 (V8 sandbox blocks napi external buffers: "External buffers are
// not allowed"); wasm audio lives on the Emscripten heap and is unaffected.
const path=require('node:path'),fs=require('node:fs');
const sherpa=require('sherpa-onnx-node');
const base=process.env.SHIBA_MODELS;
const wasmDir=path.join(__dirname,'tts-wasm');
let recognizer,tts,ttsModule,taTts,taModule,taDirLoaded;
function gc(){if(global.gc){for(let i=0;i<3;i++)global.gc();}}
// Load one instance of the vendored sherpa WASM TTS runtime + its JS API.
// Each TTS flavour (Kokoro, Tamil VITS) gets its own Module instance.
async function loadTtsRuntime(){
 const preset={print:()=>{},printErr:()=>{},locateFile:(p,sd)=>(sd||'')+p};
 let src=fs.readFileSync(path.join(wasmDir,'sherpa-onnx-wasm-main-tts.js'),'utf8');
 src=src.replace(/loadPackage\(\{files:\[[^\]]*\]/,'loadPackage({files:[]');
 const prevCwd=process.cwd();process.chdir(wasmDir);
 const Module=await new Promise((res,rej)=>{preset.onRuntimeInitialized=()=>res(preset);preset.onAbort=e=>rej(Error('Voice runtime failed to start: '+e));try{new Function('Module','__dirname','require',src+';return Module;')(preset,wasmDir,require);}catch(e){rej(e);}});
 process.chdir(prevCwd);
 const m={exports:{}};new Function('module','exports','require',fs.readFileSync(path.join(wasmDir,'sherpa-onnx-tts.js'),'utf8'))(m,m.exports,require);
 return {Module,api:m.exports};
}
function emptyTtsCfg(){return {offlineTtsVitsModelConfig:{model:'',lexicon:'',tokens:'',dataDir:'',noiseScale:0.667,noiseScaleW:0.8,lengthScale:1.0},offlineTtsMatchaModelConfig:{acousticModel:'',vocoder:'',lexicon:'',tokens:'',dataDir:'',noiseScale:0.667,noiseScaleW:0.8,lengthScale:1.0},offlineTtsKokoroModelConfig:{model:'',voices:'',tokens:'',dataDir:'',lengthScale:1.0,lexicon:'',lang:''},offlineTtsKittenModelConfig:{model:'',voices:'',tokens:'',dataDir:'',lengthScale:1.0,lexicon:''},offlineTtsZipVoiceModelConfig:{tokens:'',encoder:'',decoder:'',vocoder:'',dataDir:'',lexicon:'',featScale:0.1,tShift:0.5,targetRMS:0.1,guidanceScale:1.0},offlineTtsPocketModelConfig:{lmFlow:'',lmMain:'',encoder:'',decoder:'',textConditioner:'',vocabJson:'',tokenScoresJson:'',voiceEmbeddingCacheCapacity:50},offlineTtsSupertonicModelConfig:{durationPredictor:'',textEncoder:'',vectorEstimator:'',vocoder:'',ttsJson:'',unicodeIndexer:'',voiceStyle:''},numThreads:2,debug:0,provider:'cpu'};}
async function ensureAsr(){
 if(recognizer)return;
 if(tts&&process.env.VOICE_SWAP==='1'){tts=null;ttsModule=null;gc();}
 const asr=path.join(base,'sherpa-onnx-whisper-tiny');
 recognizer=await sherpa.OfflineRecognizer.createAsync({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{whisper:{encoder:path.join(asr,'tiny-encoder.int8.onnx'),decoder:path.join(asr,'tiny-decoder.int8.onnx'),language:'',task:'transcribe'},tokens:path.join(asr,'tiny-tokens.txt'),numThreads:2,provider:'cpu',debug:0}});
}
async function ensureTts(){
 if(tts)return;
 if(recognizer&&process.env.VOICE_SWAP==='1'){recognizer=null;gc();}
 // Wasm runtime: vendored in tts-wasm/. The bundled .data is intentionally empty
 // (piper pack stripped); Kokoro weights are mounted below from first-run setup files.
 const {Module,api}=await loadTtsRuntime();
 const m={exports:api};
 const kokoroDir=path.join(base,'kokoro-int8-multi-lang-v1_0');
 for(const f of ['model.int8.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','phone-zh.fst','date-zh.fst','number-zh.fst'])Module['FS_createDataFile']('/kokoro-'+f,null,new Uint8Array(fs.readFileSync(path.join(kokoroDir,f))),true,true,true);
 const kokoro={model:'/kokoro-model.int8.onnx',voices:'/kokoro-voices.bin',tokens:'/kokoro-tokens.txt',dataDir:'',lengthScale:1.0,lexicon:'/kokoro-lexicon-us-en.txt,/kokoro-lexicon-zh.txt',lang:''};
 const emptyVits={model:'',lexicon:'',tokens:'',dataDir:'',noiseScale:0.667,noiseScaleW:0.8,lengthScale:1.0};
 gc();
 gc();
 const cfg={offlineTtsModelConfig:{offlineTtsVitsModelConfig:emptyVits,offlineTtsMatchaModelConfig:{acousticModel:'',vocoder:'',lexicon:'',tokens:'',dataDir:'',noiseScale:0.667,noiseScaleW:0.8,lengthScale:1.0},offlineTtsKokoroModelConfig:kokoro,offlineTtsKittenModelConfig:{model:'',voices:'',tokens:'',dataDir:'',lengthScale:1.0,lexicon:''},offlineTtsZipVoiceModelConfig:{tokens:'',encoder:'',decoder:'',vocoder:'',dataDir:'',lexicon:'',featScale:0.1,tShift:0.5,targetRMS:0.1,guidanceScale:1.0},offlineTtsPocketModelConfig:{lmFlow:'',lmMain:'',encoder:'',decoder:'',textConditioner:'',vocabJson:'',tokenScoresJson:'',voiceEmbeddingCacheCapacity:50},offlineTtsSupertonicModelConfig:{durationPredictor:'',textEncoder:'',vectorEstimator:'',vocoder:'',ttsJson:'',unicodeIndexer:'',voiceStyle:''},numThreads:2,debug:0,provider:'cpu'},ruleFsts:'/kokoro-phone-zh.fst,/kokoro-date-zh.fst,/kokoro-number-zh.fst',ruleFars:'',maxNumSentences:1};
 tts=m.exports.createOfflineTts(Module,cfg);ttsModule=Module;
}
// Tamil VITS branch (last-mile item 1): the same vendored sherpa WASM
// runtime, a second Module instance, with the Piper Tamil model + tokens
// prepared by tools/tamil-voice-setup.cjs mounted into its filesystem.
// The model carries the setup-injected metadata (model_type=vits,
// comment=piper, has_espeak=1, language=Tamil), but this WASM build has
// no built-in espeak frontend, so - exactly like the spike - the text is
// phonemized by the separate piper-phonemize WASM (fetched by the setup
// script into <modelDir>/piper-phonemize/) and the phoneme codepoints go
// to generateWithConfig. Text arriving here is already Tamil script
// (tamil-voice.cjs prepares/transliterates before the call).
let taPhonemizer=null;
async function loadPhonemizer(phDir){
 const preset={print:()=>{},printErr:()=>{},locateFile:(p,sd)=>(sd||'')+p};
 const src=fs.readFileSync(path.join(phDir,'piper-phonemize-wasm-main.js'),'utf8');
 const prevCwd=process.cwd();process.chdir(phDir);
 const Module=await new Promise((res,rej)=>{preset.onRuntimeInitialized=()=>res(preset);preset.onAbort=e=>rej(Error('Tamil phonemizer failed to start: '+e));try{new Function('Module','__dirname','require',src+';return Module;')(preset,phDir,require);}catch(e){rej(e);}});
 process.chdir(prevCwd);
 const apiSrc=fs.readFileSync(path.join(phDir,'piper-phonemize.js'),'utf8');
 const api=new Function('Module','__dirname','require',apiSrc+';return {piperPhonemizeInitialize,piperPhonemize};')(Module,phDir,require);
 const sr=api.piperPhonemizeInitialize();
 if(!(sr>0))throw Error('Tamil phonemizer could not initialize espeak-ng.');
 return api;
}
async function ensureTtsTa(modelDir){
 if(taTts&&taDirLoaded===modelDir)return;
 if(typeof modelDir!=='string'||!modelDir)throw Error('Tamil voice model folder is not configured.');
 const modelPath=path.join(modelDir,'ta_IN-ValluvarNeural-medium.onnx');
 const tokensPath=path.join(modelDir,'ta-tokens.txt');
 if(!fs.existsSync(modelPath)||!fs.existsSync(tokensPath))throw Error('Tamil voice is not set up. Run: node tools/tamil-voice-setup.cjs <dir> first (experimental spike).');
 const phDir=path.join(modelDir,'piper-phonemize');
 for(const f of ['piper-phonemize-wasm-main.js','piper-phonemize-wasm-main.wasm','piper-phonemize-wasm-main.data','piper-phonemize.js'])
  if(!fs.existsSync(path.join(phDir,f)))throw Error('Tamil phonemizer files are missing. Re-run: node tools/tamil-voice-setup.cjs <dir> - it also fetches the phonemizer (one-time).');
 const {Module,api}=await loadTtsRuntime();
 Module['FS_createDataFile']('/ta-model.onnx',null,new Uint8Array(fs.readFileSync(modelPath)),true,true,true);
 Module['FS_createDataFile']('/ta-tokens.txt',null,new Uint8Array(fs.readFileSync(tokensPath)),true,true,true);
 const cfg={offlineTtsModelConfig:emptyTtsCfg(),ruleFsts:'',ruleFars:'',maxNumSentences:1};
 cfg.offlineTtsModelConfig.offlineTtsVitsModelConfig={model:'/ta-model.onnx',lexicon:'',tokens:'/ta-tokens.txt',dataDir:'',noiseScale:0.667,noiseScaleW:0.8,lengthScale:1.0};
 taTts=api.createOfflineTts(Module,cfg);taModule=Module;taDirLoaded=modelDir;
 taPhonemizer=await loadPhonemizer(phDir);
}
process.on('message',async m=>{if(!m||!Number.isInteger(m.id))return;try{let result;
 if(m.type==='transcribe'){
  await ensureAsr();
  if(!Array.isArray(m.samples)||m.samples.length>16000*30)throw Error('Voice turn exceeds30seconds.');const __t0=Date.now();const stream=recognizer.createStream();stream.acceptWaveform({samples:Float32Array.from(m.samples),sampleRate:16000});await recognizer.decodeAsync(stream);result={text:recognizer.getResult(stream).text};if(process.env.VOICE_TIMING)fs.appendFileSync(process.env.VOICE_TIMING,'transcribe '+(Date.now()-__t0)+'ms swap='+(process.env.VOICE_SWAP||'0')+'\n');
 }else if(m.type==='synthesize'){
  await ensureTts();
  if(typeof m.text!=='string'||m.text.length>2500)throw Error('Voice reply is too long.');const __t1=Date.now();let audio;try{audio=tts.generate({text:m.text,sid:0,speed:1.05});}catch(e1){const clean=m.text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,'').replace(/\s{2,}/g,' ').trim();if(!clean||clean===m.text)throw e1;audio=tts.generate({text:clean,sid:0,speed:1.05});}if(process.env.VOICE_TIMING)fs.appendFileSync(process.env.VOICE_TIMING,'synthesize '+(Date.now()-__t1)+'ms swap='+(process.env.VOICE_SWAP||'0')+'\n');result={samples:Array.from(audio.samples),sampleRate:audio.sampleRate};
 }else if(m.type==='synthesize-ta'){
  if(typeof m.text!=='string'||m.text.length>2500)throw Error('Voice reply is too long.');
  await ensureTtsTa(m.modelDir);
  const __t2=Date.now();
  const sentences=taPhonemizer.piperPhonemize(m.text,'ta');
  if(!sentences)throw Error('Tamil phonemizer failed on that text.');
  const cps=sentences.filter(x=>x.length>0);
  if(!cps.length)throw Error('Tamil phonemizer produced no phonemes for that text.');
  const audio=taTts.generateWithConfig('',{phonemeCodepoints:cps,sid:0,speed:1.0});
  if(!audio||!audio.samples||!audio.samples.length)throw Error('Tamil voice produced no audio.');
  if(process.env.VOICE_TIMING)fs.appendFileSync(process.env.VOICE_TIMING,'synthesize-ta '+(Date.now()-__t2)+'ms\n');result={samples:Array.from(audio.samples),sampleRate:audio.sampleRate};
 }else if(m.type==='ready')result={ready:true};else throw Error('Unknown voice operation');gc();gc();process.send({id:m.id,result});
 }catch(e){process.send({id:m.id,error:e.message});}});
