const {test}=require('node:test');const assert=require('node:assert/strict');const {safeWeb,localUrl,freeModel,petPosition}=require('./core.cjs');
test('external opening rejects code/file schemes',()=>{for(const u of ['javascript:alert(1)','file:///etc/passwd','ftp://example.com'])assert.throws(()=>safeWeb(u));assert.equal(safeWeb('https://chatgpt.com'),'https://chatgpt.com/');});
test('n8n must be local, no credentials',()=>{for(const u of ['https://evil.com','http://localhost.evil.com','http://u:p@localhost'])assert.throws(()=>localUrl(u));assert.equal(localUrl('http://localhost:5678').port,'5678');});
test('cloud cannot select paid fallback',()=>{assert.equal(freeModel('openrouter/free'),'openrouter/free');assert.equal(freeModel('example/model:free'),'example/model:free');assert.throws(()=>freeModel('openai/gpt-4'));});
test('pet remains within work area',()=>{assert.deepEqual(petPosition(-20,999,{x:0,y:0,width:1280,height:800}),{x:0,y:670});});

