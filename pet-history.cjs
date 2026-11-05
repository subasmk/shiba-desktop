// Only app-defined event enums and counts. No prompts, transcripts, notes, file paths or laptop history.
const allowed=new Set(['touch-head','touch-body','touch-paws','drag','dock','timer-start','timer-finish','note-saved','chat-turn','app-open']);
class PetHistory {
 constructor(saved={}){this.counts={};for(const [k,v] of Object.entries(saved))if(allowed.has(k)&&Number.isSafeInteger(v)&&v>=0)this.counts[k]=Math.min(v,999999);this.lastRoast=0;}
 record(event){if(!allowed.has(event))return false;this.counts[event]=Math.min((this.counts[event]||0)+1,999999);return true;}
 summary(){return Object.entries(this.counts).map(([event,count])=>({event,count}));}
 roast(now=Date.now()){
  if(now-this.lastRoast<90000)return null;
  const c=this.counts;let line=null;
  if((c['touch-head']||0)>=4)line='Bro, en thalai touch screen illa. Konjam break kudu.';
  else if((c['timer-start']||0)>=3&&(c['timer-finish']||0)===0)line='Timer start panradhu warm-up dhaan. Oru round finish pannuvoma, bro?';
  else if((c.drag||0)>=4)line='Bro, enna desktop-la Uber madhiri suthura.';
  else if((c['app-open']||0)>=5)line='Apps open panra speed super, bro. Ippo onnu mudippoma?';
  if(line)this.lastRoast=now;return line;
 }
 clear(){this.counts={};this.lastRoast=0;}
}
// Deterministic answers about the user's own recorded pet activity. The LLM never
// sees these questions, so it can never invent counts or past actions.
function parseHistoryQuery(text){
 const t=String(text).toLowerCase();
 if(!/how many|count|ethana|ethanai|evlo|evolo|evalo|what did i|enna pannen|enna panne|my (history|activity|stats|status)|did i (open|touch|use|drag)/.test(t))return null;
 if(/app/.test(t))return 'app-open';
 if(/touch|thott|thoda/.test(t))return 'touches';
 if(/drag|suthu|suthi|iluth/.test(t))return 'drag';
 if(/timer|focus/.test(t))return 'timer';
 if(/note/.test(t))return 'note-saved';
 if(/chat|pesi|pesun|message|talk/.test(t))return 'chat-turn';
 return 'all';
}
function statusAnswer(kind,counts){
 const c=k=>counts[k]||0;
 const line=(n,one,many)=>n===0?'0':n===1?'1 '+one:n+' '+many;
 if(kind==='app-open')return c('app-open')?`I counted only launches you asked me to make in this app: ${line(c('app-open'),'app','apps')}.`:'I have not opened any app for you yet (0).';
 if(kind==='touches'){const n=c('touch-head')+c('touch-body')+c('touch-paws');return n?`You tapped me ${n} times (head ${c('touch-head')}, body ${c('touch-body')}, paws ${c('touch-paws')}).`:'You have not tapped me yet (0).';}
 if(kind==='drag')return c('drag')?`You dragged me around ${line(c('drag'),'time','times')}.`:'You have not dragged me yet (0).';
 if(kind==='timer')return c('timer-start')?`Focus timers: ${c('timer-start')} started, ${c('timer-finish')} finished.`:'No focus timer started yet (0).';
 if(kind==='note-saved')return c('note-saved')?`Quick notes saved: ${c('note-saved')}.`:'No quick note saved yet (0).';
 if(kind==='chat-turn')return c('chat-turn')?`Chat turns with me: ${c('chat-turn')}.`:'No chat turn yet (0).';
 return `What I actually recorded on this laptop: apps opened ${c('app-open')}, taps ${c('touch-head')+c('touch-body')+c('touch-paws')}, drags ${c('drag')}, timers ${c('timer-start')} started/${c('timer-finish')} finished, notes ${c('note-saved')}, chat turns ${c('chat-turn')}. Nothing else is tracked.`;
}
module.exports={PetHistory,parseHistoryQuery,statusAnswer};
