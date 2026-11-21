const {test}=require('node:test'),a=require('node:assert/strict');const {selectApps,launchApp}=require('./apps.cjs');
test('exact and ambiguous names are separate choices, never commands',()=>{const apps=[{name:'Chrome'},{name:'Chrome Beta'},{name:'Visual Studio Code'}];a.deepEqual(selectApps(apps,' chrome '),[apps[0]]);a.equal(selectApps(apps,'chro').length,2);a.equal(selectApps(apps,'cmd /c del *').length,0);a.equal(selectApps(apps,'').length,0);});
test('arbitrary paths and model text have no launch token',async()=>{await a.rejects(launchApp('C:\\Windows\\System32\\cmd.exe'));await a.rejects(launchApp('$(calc)'));});

const {parseLaunch}=require('./apps.cjs');test('launch grammar preserves explicit user command only',()=>{a.equal(parseLaunch('open Chrome'),'Chrome');a.equal(parseLaunch('Chrome open pannu'),'Chrome');a.equal(parseLaunch('Tell me about Chrome'),null);a.equal(parseLaunch('I want you to delete files'),null);});

const {matchApps,warmCatalog,launchByName}=require('./apps.cjs');
test('matchApps scores exact, substring and alias matches',()=>{
 const apps=[{name:'Google Chrome',token:'t1'},{name:'Visual Studio Code',token:'t2'},{name:'Chrome Beta',token:'t3'},{name:'OBS Studio',token:'t4'}];
 a.equal(matchApps(apps,'Visual Studio Code').app.token,'t2');
 a.equal(matchApps(apps,'vs code').app.token,'t2');
 a.equal(matchApps(apps,'vscode').app.token,'t2');
 a.equal(matchApps(apps,'obs').app.token,'t4');
 a.equal(matchApps(apps,'google chrome').app.token,'t1');
 a.equal(matchApps(apps,'nonexistent app xyz').status,'not-found');
 a.equal(matchApps(apps,'').status,'not-found');
});
test('matchApps keeps ties ambiguous instead of guessing',()=>{
 const apps=[{name:'Chrome',token:'t1'},{name:'Chrome Beta',token:'t2'}];
 const m=matchApps(apps,'chrom');a.equal(m.status,'ambiguous');a.deepEqual(m.choices,['Chrome','Chrome Beta']);
 a.equal(matchApps(apps,'chrome').app.token,'t1');
});
test('off Windows the launch contract still refuses, warm is a no-op',async()=>{
 if(process.platform==='win32')return;
 a.equal(await warmCatalog(),null);
 await a.rejects(launchByName('chrome'),/requires Windows/);
});
