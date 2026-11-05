// CLI wrapper around tamil-setup.cjs (same code the app uses in-process).
// Usage: node tools/tamil-voice-setup.cjs <output-dir>
// Downloads are verified against the sha256 pins hard-coded in tamil-setup.cjs;
// a mismatch fails loudly and installs nothing.
const {prepareTamilVoice}=require('../tamil-setup.cjs');
const outDir=process.argv[2]||'ta-voice';
let lastLine=0;
prepareTamilVoice(outDir,{onProgress:p=>{
  const now=Date.now();if(now-lastLine<500&&(!p.total||p.bytes<p.total))return;lastLine=now;
  const pct=p.total?' '+Math.round(100*p.bytes/p.total)+'%':' '+Math.round(p.bytes/1048576)+' MB';
  console.log('Downloading',p.step+pct);
}}).then(r=>{
  console.log('TAMIL-VOICE-SETUP-OK',outDir,r.already?'(already prepared)':('model bytes '+r.model.modelBytes+', tokens '+r.model.tokens+', phonemizer ready'));
}).catch(e=>{console.error('SETUP-FAIL',e.message);process.exit(1);});
