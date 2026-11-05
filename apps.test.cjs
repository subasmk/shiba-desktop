const {test}=require('node:test'),a=require('node:assert/strict');const {selectApps,launchApp}=require('./apps.cjs');
test('exact and ambiguous names are separate choices, never commands',()=>{const apps=[{name:'Chrome'},{name:'Chrome Beta'},{name:'Visual Studio Code'}];a.deepEqual(selectApps(apps,' chrome '),[apps[0]]);a.equal(selectApps(apps,'chro').length,2);a.equal(selectApps(apps,'cmd /c del *').length,0);a.equal(selectApps(apps,'').length,0);});
test('arbitrary paths and model text have no launch token',async()=>{await a.rejects(launchApp('C:\\Windows\\System32\\cmd.exe'));await a.rejects(launchApp('$(calc)'));});

const {parseLaunch}=require('./apps.cjs');test('launch grammar preserves explicit user command only',()=>{a.equal(parseLaunch('open Chrome'),'Chrome');a.equal(parseLaunch('Chrome open pannu'),'Chrome');a.equal(parseLaunch('Tell me about Chrome'),null);a.equal(parseLaunch('I want you to delete files'),null);});
