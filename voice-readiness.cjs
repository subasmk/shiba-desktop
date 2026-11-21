const {resolveEngine}=require('./voice-clone.cjs');
function readiness(models,settings={}){
 const asr=models.asr||{ready:models.ready,missing:models.missing||[]};
 const local=models.local||{ready:models.ready,missing:models.missing||[]};
 const engine=resolveEngine(settings);
 const cloud=engine==='elevenlabs';
 const selectedOutputReady=cloud?!!settings.hasElevenKey&&!!settings.elevenVoiceId:engine==='kokoro'?!!local.ready:engine==='fish'?!!settings.hasFishKey&&!!settings.fishVoiceByMascot?.vex:engine==='chatterbox'?!!settings.chatterboxCommand:true;
 const outputReady=selectedOutputReady||(cloud&&!!local.ready);
 return {ready:!!asr.ready&&outputReady,asr,local,engine,selectedOutputReady,outputReady,usingLocalFallback:cloud&&!selectedOutputReady&&!!local.ready,fallbackReady:!!local.ready,reason:!asr.ready?'Microphone speech recognition is missing. Open Setup and install speech recognition.':!outputReady?(cloud?'Save your ElevenLabs key in Dashboard > Voice, or install the local fallback voice.':engine==='kokoro'?'Local speech output is missing. Open Setup and install local voice.':'Configure the selected voice engine in Dashboard > Voice.'):null};
}
function installedModel(models,want){return (models||[]).find(m=>m===want)||null;}
function drawerBounds(area,width=650,height=650){const w=Math.min(width,area.width),h=Math.min(height,area.height);return {x:Math.round(area.x+(area.width-w)/2),y:area.y,width:w,height:h};}
module.exports={readiness,installedModel,drawerBounds};
