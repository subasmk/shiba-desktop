const { test } = require('node:test'), a = require('node:assert/strict');
const { matchReflex, formatTime, formatDate, formatRemaining } = require('./reflex.cjs');

const NOW = new Date(2026, 10, 21, 19, 45); // Sat 21 Nov 2026, 7:45 PM

test('time and date answer whole-message questions only', () => {
  a.equal(matchReflex("what's the time", NOW).text, "It's 7:45 PM.");
  a.equal(matchReflex('Hey Rex, what is the time?', NOW).text, "It's 7:45 PM.");
  a.equal(matchReflex('mani enna', NOW).kind, 'say');
  a.equal(matchReflex('what day is today', NOW).text, 'Today is Saturday, 21 November 2026.');
  a.equal(formatTime(new Date(2026, 0, 1, 0, 5)), '12:05 AM');
  a.equal(formatDate(new Date(2026, 0, 1)), 'Thursday, 1 January 2026');
});

test('questions ABOUT time or timers do not trip the reflex', () => {
  a.equal(matchReflex('what is the time complexity of quicksort', NOW), null);
  a.equal(matchReflex('tell me a story about a timer', NOW), null);
  a.equal(matchReflex('how do timers work in javascript', NOW), null);
  a.equal(matchReflex('what is the date of the exam', NOW), null);
  a.equal(matchReflex('', NOW), null);
  a.equal(matchReflex('hello there', NOW), null);
});

test('volume rules map to pc-control actions', () => {
  a.deepEqual(matchReflex('set volume to 40', NOW), { kind: 'pc', action: 'volume-set', target: '40', okLine: 'Volume set to 40%.' });
  a.equal(matchReflex('volume 250', NOW).target, '100');
  a.equal(matchReflex('volume up', NOW).action, 'volume-up');
  a.equal(matchReflex('turn the volume down', NOW).action, 'volume-down');
  a.equal(matchReflex('mute', NOW).action, 'volume-mute');
});

test('timer rules parse durations and ops', () => {
  a.deepEqual(matchReflex('set a timer for 25 minutes', NOW), { kind: 'timer', op: 'start', minutes: 25 });
  a.deepEqual(matchReflex('start timer 10', NOW), { kind: 'timer', op: 'start', minutes: 10 });
  a.deepEqual(matchReflex('10 minute timer', NOW), { kind: 'timer', op: 'start', minutes: 10 });
  a.deepEqual(matchReflex('set a timer for 1 hour', NOW), { kind: 'timer', op: 'start', minutes: 60 });
  a.deepEqual(matchReflex('focus for 45', NOW), { kind: 'timer', op: 'start', minutes: 45 });
  a.equal(matchReflex('stop the timer', NOW).op, 'stop');
  a.equal(matchReflex('pause timer', NOW).op, 'pause');
  a.equal(matchReflex('resume the timer', NOW).op, 'resume');
  a.equal(matchReflex('how much time left', NOW).op, 'status');
});

test('music rules map to queue ops', () => {
  a.equal(matchReflex('next song', NOW).op, 'next');
  a.equal(matchReflex('skip this song', NOW).op, 'next');
  a.equal(matchReflex('previous track', NOW).op, 'prev');
  a.equal(matchReflex('pause the music', NOW).op, 'pause');
  a.equal(matchReflex('play the music', NOW).op, 'play');
});

test('formatRemaining reads naturally', () => {
  a.equal(formatRemaining(25 * 60000), '25 minutes');
  a.equal(formatRemaining(90000), '1 minute 30 seconds');
  a.equal(formatRemaining(45000), '45 seconds');
  a.equal(formatRemaining(2 * 3600000 + 5 * 60000), '2 hours 5 minutes');
  a.equal(formatRemaining(0), '0 seconds');
});

test('action reflex requires a whole direct command, never a question, quote or negation',()=>{for(const text of ["don't stop the timer",'do not start a timer for 5 minutes',"don't play music",'How do I turn the volume up?','Explain how to set volume to 50','what happens if I pause the music','start timer for 5 minutes but not now','if I say next song what happens','please do not mute','can you play music?','"volume up"','play music and then stop the timer'])a.equal(matchReflex(text,NOW),null,text);a.equal(matchReflex('please start a timer for 5 minutes',NOW).minutes,5);a.equal(matchReflex('Hey Daru, volume up please!',NOW).action,'volume-up');a.equal(matchReflex('how much time is left?',NOW).op,'status');});
test('seconds timers stay exact and zero is not silently made a minute',()=>{a.deepEqual(matchReflex('start timer for 20 seconds',NOW),{kind:'timer',op:'start',seconds:20});a.deepEqual(matchReflex('90 second timer',NOW),{kind:'timer',op:'start',seconds:90});a.equal(matchReflex('start timer for 0 seconds',NOW),null);a.equal(matchReflex('set timer for 2 hours',NOW).minutes,120);});
test('setup fallback only steps down, never up, and unknown model stays explicit',()=>{const {fallbackModels}=require('./setup.cjs');a.deepEqual(fallbackModels('qwen3:8b'),['qwen3:8b','qwen3:1.7b','qwen3:0.6b']);a.deepEqual(fallbackModels('qwen3:1.7b'),['qwen3:1.7b','qwen3:0.6b']);a.deepEqual(fallbackModels('qwen3:0.6b'),['qwen3:0.6b']);a.deepEqual(fallbackModels('custom:local'),['custom:local']);});
test('failed setup pulls actually retry only smaller models',async()=>{const {pullWithFallback}=require('./setup.cjs');const saved=global.fetch,requests=[];global.fetch=async(url,options)=>{requests.push(JSON.parse(options.body).name);return {ok:false,status:503};};try{await a.rejects(pullWithFallback('qwen3:0.6b'),/No local brain model/);a.deepEqual(requests,['qwen3:0.6b']);requests.length=0;await a.rejects(pullWithFallback('qwen3:1.7b'),/No local brain model/);a.deepEqual(requests,['qwen3:1.7b','qwen3:0.6b']);}finally{global.fetch=saved;}});
