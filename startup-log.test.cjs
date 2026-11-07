const test=require('node:test');const assert=require('node:assert');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createStartupLog}=require('./startup-log.cjs');
test('startup log writes timestamped milestone lines',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slog-'));
  const s=createStartupLog(dir);
  s.log('process-start',{platform:'win32'});s.log('panel-shown');
  const lines=fs.readFileSync(s.path,'utf8').trim().split('\n');
  assert.equal(lines.length,2);
  assert.match(lines[0],/^\d{4}-\d{2}-\d{2}T.*\+\d+ms process-start \{"platform":"win32"\}$/);
  assert.match(lines[1],/\+\d+ms panel-shown$/);
});
test('previous launch rotates to startup-prev.log',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slog-'));
  fs.writeFileSync(path.join(dir,'startup.log'),'old launch\n');
  const s=createStartupLog(dir);s.log('process-start');
  assert.equal(fs.readFileSync(path.join(dir,'startup-prev.log'),'utf8'),'old launch\n');
  assert.match(fs.readFileSync(s.path,'utf8'),/process-start/);
});
test('unwritable directory never throws',()=>{
  const s=createStartupLog(path.join(os.tmpdir(),'slog-null-bad/dir'));
  assert.doesNotThrow(()=>s.log('process-start',{a:1}));
});
