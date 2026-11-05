// Builds mic-fixture-gapped.wav: 3 copies of the 7s speech fixture separated by
// long silence gaps, so the packaged full-chain test gets clean turn boundaries
// (the looping short fixture never goes quiet, so VAD speechStart barge-in cancels
// every in-flight brain reply on any machine where ASR+brain outlasts 7s).
// Output layout: speech, 180s silence, speech, 180s silence, speech, 300s silence.
const fs=require('node:fs');
const src=fs.readFileSync('mic-fixture-short.wav');
// Parse minimal RIFF/WAVE: find the 'data' chunk.
function dataChunk(buf){let off=12;while(off+8<=buf.length){const id=buf.toString('ascii',off,off+4);const size=buf.readUInt32LE(off+4);if(id==='data')return {off:off+8,size};off+=8+size+(size&1);}throw Error('no data chunk');}
const d=dataChunk(src);const pcm=src.subarray(d.off,d.off+d.size);
const bytesPerSec=48000*2; // source is 48kHz 16-bit mono
const gaps=[180,180,300];
const parts=[pcm];for(const g of gaps){parts.push(Buffer.alloc(g*bytesPerSec));parts.push(pcm);}
parts.pop(); // end with trailing silence, not speech
const body=Buffer.concat(parts);
const hdr=Buffer.from(src.subarray(0,d.off)); // reuse source header incl fmt chunk
hdr.writeUInt32LE(36+body.length,4); // RIFF size (assumes canonical layout: fmt 16 bytes)
hdr.writeUInt32LE(body.length,hdr.length-4); // data chunk size is the last 4 bytes before payload
fs.writeFileSync('mic-fixture-gapped.wav',Buffer.concat([hdr,body]));
console.log('mic-fixture-gapped.wav bytes',hdr.length+body.length,'seconds',(body.length/bytesPerSec).toFixed(1));
