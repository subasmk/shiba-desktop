const { test } = require('node:test'), a = require('node:assert/strict');
const { normalize, scoreElement, matchElement, buildListCommand, listElements, tryPoint } = require('./fast-pick.cjs');

test('normalize flattens case, punctuation and spacing', () => {
  a.equal(normalize('  Play / Pause!! '), 'play pause');
  a.equal(normalize('Counter-Strike 2'), 'counter strike 2');
  a.equal(normalize(''), '');
});

test('scoreElement ranks exact over partial matches', () => {
  a.equal(scoreElement('Start', 'start'), 100);
  a.ok(scoreElement('Start menu', 'start') >= 80);
  a.ok(scoreElement('Start', 'start menu') >= 70);
  a.equal(scoreElement('Volume mixer', 'volume'), 85);
  a.equal(scoreElement('Open volume', 'volume'), 80);
  a.equal(scoreElement('Volume and sound settings', 'volume settings'), 65);
  a.ok(scoreElement('Recycle Bin', 'volume') < 60);
});

test('matchElement picks the best confident element and skips junk', () => {
  const els = [
    { name: '', x: 0, y: 0, w: 10, h: 10 },
    { name: 'Ghost', x: 0, y: 0, w: 0, h: 0 },
    { name: 'Volume', x: 100, y: 200, w: 40, h: 20 },
    { name: 'Volume mixer', x: 300, y: 200, w: 90, h: 20 },
  ];
  const m = matchElement(els, 'volume');
  a.equal(m.element.name, 'Volume');
  a.equal(m.score, 100);
  a.equal(matchElement(els, 'nonexistent thing'), null);
  a.equal(matchElement([], 'volume'), null);
  a.equal(matchElement(null, 'volume'), null);
});

test('buildListCommand is one PowerShell UIA walk', () => {
  const c = buildListCommand();
  a.equal(c.file, 'powershell.exe');
  a.equal(c.confirmFirst, false);
  const body = c.args.at(-1);
  a.ok(body.includes('UIAutomationClient'));
  a.ok(body.includes('ConvertTo-Json'));
});

test('listElements is a clean miss off Windows', async () => {
  if (process.platform === 'win32') return;
  a.equal(await listElements(), null);
});

test('tryPoint returns centre coordinates for a confident pick', async () => {
  const listElements = async () => [{ name: 'Steam', x: 100, y: 100, w: 50, h: 30 }];
  const hit = await tryPoint('steam', { listElements });
  a.deepEqual(hit, { x: 125, y: 115, name: 'Steam', score: 100, via: 'fast-pick' });
});

test('tryPoint misses cleanly: no list, no match, lister failure', async () => {
  a.equal(await tryPoint('steam', { listElements: async () => null }), null);
  a.equal(await tryPoint('steam', { listElements: async () => [] }), null);
  a.equal(await tryPoint('steam', { listElements: async () => [{ name: 'Other', x: 0, y: 0, w: 9, h: 9 }] }), null);
  a.equal(await tryPoint('steam', { listElements: async () => { throw Error('uia down'); } }), null);
});

test('equally good controls at different locations ask rather than picking first',async()=>{const rows=[{name:'Save',x:10,y:20,w:50,h:20},{name:'Save',x:400,y:500,w:50,h:20}];a.equal(matchElement(rows,'Save').ambiguous,true);a.deepEqual(await tryPoint('Save',{listElements:async()=>rows}),{ambiguous:true,choices:['Save','Save']});a.equal(matchElement([rows[0],{...rows[0]}],'Save').element,rows[0]);a.equal(matchElement([...rows,{name:'Save document',x:10,y:200,w:40,h:20}],'Save document').element.name,'Save document');});
