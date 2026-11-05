// Private local inference process. Only fixed task types, fixed local model paths.
// ASR: native sherpa-onnx Whisper-tiny (works under the Electron runtime).
// TTS: sherpa-onnx WASM Kokoro-int8. The native sherpa TTS addon cannot return audio
// inside Electron 45 (V8 sandbox blocks napi external buffers: "External buffers are
// not allowed"); wasm audio lives on the Emscripten heap and is unaffected.
const path=require('node:path'),fs=require('node:fs');
const sherpa=require('sherpa-onnx-node');
const base=process.env.SHIBA_MODELS;
const wasmDir=path.join(__dirname,'tts-wasm');
let recognizer,tts,ttsModule;
function gc(){if(global.gc){for(let i=0;i<3;i++)global.gc();}}
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
 const preset={print:()=>{},printErr:()=>{},locateFile:(p,sd)=>(sd||'')+p};
 let src=fs.readFileSync(path.join(wasmDir,'sherpa-onnx-wasm-main-tts.js'),'utf8');
 src=src.replace(/loadPackage\(\{files:\[[^\]]*\]/,'loadPackage({files:[]');
 const prevCwd=process.cwd();process.chdir(wasmDir);
 const Module=await new Promise((res,rej)=>{preset.onRuntimeInitialized=()=>res(preset);preset.onAbort=e=>rej(Error('Voice runtime failed to start: '+e));try{new Function('Module','__dirname','require',src+';return Module;')(preset,wasmDir,require);}catch(e){rej(e);}});
 process.chdir(prevCwd);
 const m={exports:{}};new Function('module','exports','require',fs.readFileSync(path.join(wasmDir,'sherpa-onnx-tts.js'),'utf8'))(m,m.exports,require);
 const kokoroDir=path.join(base,'kokoro-int8-multi-lang-v1_0');
 for(const f of ['model.int8.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','phone-zh.fst','date-zh.fst','number-zh.fst'])Module['FS_createDataFile']('/kokoro-'+f,null,new Uint8Array(fs.readFileSync(path.join(kokoroDir,f))),true,true,true);
 const kokoro={model:'/kokoro-model.int8.onnx',voices:'/kokoro-voices.bin',tokens:'/kokoro-tokens.txt',dataDir:'',lengthScale:1.0,lexicon:'/kokoro-lexicon-us-en.txt,/kokoro-lexicon-zh.txt',lang:''};
 const emptyVits={model:'',lexicon:'',tokens:'',dataDir:'',noiseScale:0.667,noiseScaleW:0.8,lengthScale:1.0};
 gc();
 gc();
 const cfg={offlineTtsModelConfig:{offlineTtsVitsModelConfig:emptyVits,offlineTtsMatchaModelConfig:{acousticModel:'',vocoder:'',lexicon:'',tokens:'',dataDir:'',noiseScale:0.667,noiseScaleW:0.8,lengthScale:1.0},offlineTtsKokoroModelConfig:kokoro,offlineTtsKittenModelConfig:{model:'',voices:'',tokens:'',dataDir:'',lengthScale:1.0,lexicon:''},offlineTtsZipVoiceModelConfig:{tokens:'',encoder:'',decoder:'',vocoder:'',dataDir:'',lexicon:'',featScale:0.1,tShift:0.5,targetRMS:0.1,guidanceScale:1.0},offlineTtsPocketModelConfig:{lmFlow:'',lmMain:'',encoder:'',decoder:'',textConditioner:'',vocabJson:'',tokenScoresJson:'',voiceEmbeddingCacheCapacity:50},offlineTtsSupertonicModelConfig:{durationPredictor:'',textEncoder:'',vectorEstimator:'',vocoder:'',ttsJson:'',unicodeIndexer:'',voiceStyle:''},numThreads:2,debug:0,provider:'cpu'},ruleFsts:'/kokoro-phone-zh.fst,/kokoro-date-zh.fst,/kokoro-number-zh.fst',ruleFars:'',maxNumSentences:1};
 tts=m.exports.createOfflineTts(Module,cfg);ttsModule=Module;
}
process.on('message',async m=>{if(!m||!Number.isInteger(m.id))return;try{let result;
 if(m.type==='transcribe'){
  await ensureAsr();
  if(!Array.isArray(m.samples)||m.samples.length>16000*30)throw Error('Voice turn exceeds30seconds.');const __t0=Date.now();const stream=recognizer.createStream();stream.acceptWaveform({samples:Float32Array.from(m.samples),sampleRate:16000});await recognizer.decodeAsync(stream);result={text:recognizer.getResult(stream).text};if(process.env.VOICE_TIMING)fs.appendFileSync(process.env.VOICE_TIMING,'transcribe '+(Date.now()-__t0)+'ms swap='+(process.env.VOICE_SWAP||'0')+'\n');
 }else if(m.type==='synthesize'){
  await ensureTts();
  if(typeof m.text!=='string'||m.text.length>2500)throw Error('Voice reply is too long.');const __t1=Date.now();const audio=tts.generate({text:m.text,sid:0,speed:1.05});if(process.env.VOICE_TIMING)fs.appendFileSync(process.env.VOICE_TIMING,'synthesize '+(Date.now()-__t1)+'ms swap='+(process.env.VOICE_SWAP||'0')+'\n');result={samples:Array.from(audio.samples),sampleRate:audio.sampleRate};
 }else if(m.type==='ready')result={ready:true};else throw Error('Unknown voice operation');gc();gc();process.send({id:m.id,result});
 }catch(e){process.send({id:m.id,error:e.message});}});
