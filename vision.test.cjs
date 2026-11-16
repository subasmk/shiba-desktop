const test = require('node:test'), assert = require('node:assert/strict');
const { buildLocatePrompt, parsePoint, pointToPixels, parseLocateIntent, parseTitleLines, locateInImage, extractSongTitles } = require('./vision.cjs');

test('buildLocatePrompt: asks for JSON-only 0-1000 center point', () => {
  const p = buildLocatePrompt('the settings icon');
  assert.match(p, /settings icon/);
  assert.match(p, /\{"x": <0-1000>, "y": <0-1000>\}/);
  assert.match(p, /not visible/i);
});
test('parsePoint: clean JSON', () => {
  assert.deepEqual(parsePoint('{"x": 250, "y": 750}'), { x: 250, y: 750 });
});
test('parsePoint: JSON inside prose and code fences', () => {
  assert.deepEqual(parsePoint('The icon is here: {"x": 10, "y": 20} hope that helps'), { x: 10, y: 20 });
  assert.deepEqual(parsePoint('```json\n{"x": 500, "y": 500}\n```'), { x: 500, y: 500 });
});
test('parsePoint: not-visible sentinel returns null', () => {
  assert.equal(parsePoint('{"x": -1, "y": -1}'), null);
});
test('parsePoint: out-of-range values are clamped to the screen', () => {
  assert.deepEqual(parsePoint('{"x": 1400, "y": 999}'), { x: 1000, y: 999 });
  assert.deepEqual(parsePoint('{"x": 0, "y": 0}'), { x: 0, y: 0 });
});
test('parsePoint: 0-1 fraction answers are scaled to 0-1000', () => {
  assert.deepEqual(parsePoint('{"x": 0.25, "y": 0.5}'), { x: 250, y: 500 });
});
test('parsePoint: loose numbers work, garbage returns null', () => {
  assert.deepEqual(parsePoint('x=300, y=400'), { x: 300, y: 400 });
  assert.equal(parsePoint('I cannot see it anywhere'), null);
  assert.equal(parsePoint(''), null);
  assert.equal(parsePoint(null), null);
});
test('pointToPixels: maps and clamps inside the area', () => {
  assert.deepEqual(pointToPixels({ x: 0, y: 0 }, 1920, 1080), { px: 0, py: 0 });
  assert.deepEqual(pointToPixels({ x: 1000, y: 1000 }, 1920, 1080), { px: 1919, py: 1079 });
  assert.deepEqual(pointToPixels({ x: 500, y: 500 }, 1920, 1080), { px: 960, py: 540 });
  const m = pointToPixels({ x: 0, y: 1000 }, 800, 600, 70);
  assert.equal(m.px, 70); assert.equal(m.py, 529);
});
test('parseLocateIntent: English + Tanglish forms, plain chat untouched', () => {
  assert.equal(parseLocateIntent('where is the settings icon'), 'the settings icon');
  assert.equal(parseLocateIntent('Where is the search box on the screen?'), 'the search box');
  assert.equal(parseLocateIntent('find the download button'), 'the download button');
  assert.equal(parseLocateIntent('play button enga iruku'), 'play button');
  assert.equal(parseLocateIntent('where is my file'), 'my file'); // wired only when the setting is on
  assert.equal(parseLocateIntent('hello bro'), null);
  assert.equal(parseLocateIntent('open notepad'), null);
});
test('parseTitleLines: strips numbering/bullets, dedupes, caps junk', () => {
  const titles = parseTitleLines('1. Song One - Artist A\n- Song Two\n* Song One - Artist A\n\n3) Song Three');
  assert.deepEqual(titles, ['Song One - Artist A', 'Song Two', 'Song Three']);
  assert.deepEqual(parseTitleLines(''), []);
});

function fakeFetch(response, ok = true, status = 200) {
  return async (url, init) => {
    assert.match(url, /127\.0\.0\.1:11434\/api\/generate/);
    const body = JSON.parse(init.body);
    assert.equal(body.stream, false);
    assert.ok(Array.isArray(body.images) && body.images[0] === 'BASE64PNG');
    return { ok, status, json: async () => ({ response }) };
  };
}
test('locateInImage: mocked provider round-trip', async () => {
  const r = await locateInImage({ image: 'BASE64PNG', target: 'the play button', fetchFn: fakeFetch('{"x": 100, "y": 900}') });
  assert.deepEqual(r.point, { x: 100, y: 900 });
});
test('locateInImage: not found and HTTP failure are honest errors', async () => {
  await assert.rejects(() => locateInImage({ image: 'BASE64PNG', target: 'x', fetchFn: fakeFetch('{"x": -1, "y": -1}') }), /could not find/);
  await assert.rejects(() => locateInImage({ image: 'BASE64PNG', target: 'x', fetchFn: fakeFetch('', false, 404) }), /Vision request failed \(404\)/);
  await assert.rejects(() => locateInImage({ image: '', target: 'x', fetchFn: fakeFetch('{}') }), /No screenshot/);
});
test('extractSongTitles: mocked provider returns cleaned titles', async () => {
  const titles = await extractSongTitles({ image: 'BASE64PNG', fetchFn: fakeFetch('1. Alpha - A\n2. Beta - B') });
  assert.deepEqual(titles, ['Alpha - A', 'Beta - B']);
  await assert.rejects(() => extractSongTitles({ image: 'BASE64PNG', fetchFn: fakeFetch('') }), /No song titles/);
});
