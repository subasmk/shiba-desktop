// Generation guards discard every stale ASR/brain/TTS result after interruption or Stop.
class VoiceSession {
 constructor(io){this.io=io;this.active=false;this.generation=0;this.phase='off';this.controller=null;}
 async start(){if(this.active)return;this.active=true;this.phase='starting';const g=++this.generation;try{await this.io.startMic();if(!this.active||g!==this.generation){await this.io.stopMic();return;}this.phase='listening';}catch(e){this.active=false;this.phase='off';await this.io.stopMic();throw e;}}
 speechStart(){if(!this.active)return;this.generation++;this.controller?.abort();this.controller=null;this.io.cancelAudio();this.phase='listening';}
 async utterance(samples){if(!this.active)return;const g=++this.generation;this.controller?.abort();const c=new AbortController();this.controller=c;const live=()=>this.active&&g===this.generation&&!c.signal.aborted;
 try{this.phase='transcribing';const text=await this.io.transcribe(samples,c.signal);if(!live())return;if(!String(text).trim()){this.phase='listening';return;}this.phase='thinking';const reply=await this.io.reply(text,c.signal);if(!live())return;this.phase='synthesizing';const audio=await this.io.synthesize(reply,c.signal);if(!live())return;this.phase='speaking';await this.io.play(audio,c.signal);if(live())this.phase='listening';}
 catch(e){if(live()){this.phase='listening';this.io.onError?.(e);}}
 }
 async stop(){this.active=false;this.generation++;this.controller?.abort();this.controller=null;this.phase='off';this.io.cancelAudio();await this.io.stopMic();}
}
if(typeof module!=='undefined')module.exports={VoiceSession};else window.VoiceSession=VoiceSession;
