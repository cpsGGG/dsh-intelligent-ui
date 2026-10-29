import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentAnswer, projectAnswers, safeLocalImage, createStore } from '../plugin/core.mjs';
import { apply as applyHost, Config } from '../lib/index.js';

const chart = '```iui-chart\n{"title":"比较","unit":"分钟","source":"用户输入","values":[{"label":"A","value":0},{"label":"B","value":12}]}\n```';

test('native Markdown stays exact, including TeX, references, indentation and CRLF', () => {
  const source = '# 标题\r\n\r\n$$x^2$$\r\n\r\n[链接][ref]\r\n\r\n[ref]: https://example.org\r\n\r\n    console.log(1)\r\n';
  assert.deepEqual(segmentAnswer(source), [{ type: 'markdown', text: source, start: 0 }]);
});
test('complete visual fences transform and concatenation reproduces source exactly', () => {
  const source = '前文\n\n' + chart + '\n\n后文';
  const blocks = segmentAnswer(source);
  assert.equal(blocks[1].type, 'chart');
  assert.equal(blocks[1].values[0].value, 0);
  assert.equal(blocks.map(x => x.raw ?? x.text).join(''), source);
});
test('streaming prefixes cannot remove source or expose partial charts', () => {
  for (let i = 0; i < chart.length; i++) {
    const source = chart.slice(0, i);
    const blocks = segmentAnswer(source);
    assert.equal(blocks.map(x => x.raw ?? x.text).join(''), source);
    assert.equal(blocks.some(x => x.type === 'chart'), false);
  }
  assert.equal(segmentAnswer(chart)[0].type, 'chart');
});
test('nested examples, invalid JSON and indented code remain native Markdown', () => {
  for (const source of ['````markdown\n' + chart + '\n````', '    ```iui-flow\n    {}\n    ```', '```iui-chart\n{"values":[]}\n```']) {
    const blocks = segmentAnswer(source);
    assert.ok(blocks.every(x => x.type === 'markdown'));
    assert.equal(blocks.map(x => x.text).join(''), source);
  }
});
test('Chat projection excludes reasoning and tool results, retains keyed streaming answers and attachment order', () => {
  const attachment = { id: 'native-image' };
  const nodes = new Map([
    ['u', { kind: 'user', data: { content: 'question' } }],
    ['a', { kind: 'assistant-step', data: { status: 'running', blocks: [{ kind: 'reasoning', text: 'private reasoning' }, { kind: 'text', text: 'visible answer' }, { kind: 'image', attachment }, { kind: 'tool-call', text: 'tool args' }] } }],
  ]);
  const answers = projectAnswers({ order: ['u', 'a'], nodes });
  assert.equal(answers.length, 1);
  assert.equal(answers[0].text, 'visible answer');
  assert.equal(answers[0].status, 'running');
  assert.deepEqual(answers[0].images, [attachment]);
  assert.equal(answers[0].key, 'a');
});
test('native local-image helper excludes UNC, relative paths and unsafe bases', () => {
  assert.equal(safeLocalImage('dsh-app://app/', 'C:\\work\\图.png'), 'dsh-app://app/api/file?path=C%3A%5Cwork%5C%E5%9B%BE.png');
  for (const path of ['\\\\server\\image.png', '//server/image.png', 'https://example.org/x', 'relative.png', 'C:\\x\n']) assert.equal(safeLocalImage('dsh-app://app/', path), undefined);
  assert.equal(safeLocalImage('javascript:bad', '/tmp/img.png'), undefined);
});
test('host adds its own literal prompt section without replacing the deployment persona', () => {
  const sections = [];
  const tools = [], effects = [];
  const config = Config({});
  applyHost({ systemPrompt: { section: item => sections.push(item) }, tools: { register: tool => tools.push(tool) }, effect: create => effects.push(create()) }, config);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, 'dsh-intelligent-ui:answer-style');
  assert.equal(sections[0].interpolate, false);
  const context = id => ({ agent: { session: { id } } });
  assert.match(sections[0].text(context('one')), /iui-chart/);
  assert.match(sections[0].text(context('one')), /不猜测图片地址/);
  config.sessionOverrides[Symbol.for('cosmokit.volatile.write')]({ one: false });
  assert.match(sections[0].text(context('one')), /普通 Markdown/);
  assert.doesNotMatch(sections[0].text(context('one')), /```iui/);
  assert.match(sections[0].text(context('two')), /```iui/);
  assert.equal(tools[0].name, 'intelligent_ui_image_search');
  effects.forEach(dispose => dispose());
});
test('reader store disposal unsubscribes listeners and retains no duplicate notifications', () => {
  const store = createStore(null); let count = 0;
  const dispose = store.subscribe(() => count++);
  store.set({ sessionId: 'a' }); dispose(); store.set(null);
  assert.equal(count, 1); assert.equal(store.getSnapshot(), null);
});
