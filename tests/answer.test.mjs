import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, parseVisual, safeUrl, splitLongParagraph } from '../src/answer.mjs';
import { samples } from '../src/samples.mjs';

test('all demo answers parse without silently losing structured blocks', () => {
  for (const sample of samples) {
    const blocks = parseAnswer(sample.source);
    assert.ok(blocks.length > 5);
    assert.ok(blocks.some(block => block.type === 'quote'));
    assert.equal(blocks.filter(block => block.type === 'code' && block.warning).length, 0, sample.id);
  }
  assert.equal(parseAnswer(samples[0].source).find(block => block.type === 'flow').steps.length, 4);
  assert.equal(parseAnswer(samples[1].source).find(block => block.type === 'chart').values.reduce((sum, x) => sum + x.value, 0), 185);
});

test('long paragraphs split at sentence boundaries without changing any characters', () => {
  const text = '这是第一段内容，保留全部原文。'.repeat(24) + ' Version 1.25 is still intact. And so is 3.14.';
  const paragraphs = splitLongParagraph(text, 80);
  assert.ok(paragraphs.length > 1);
  assert.equal(paragraphs.join(''), text);
  assert.ok(paragraphs.some(x => x.includes('3.14')));
});

test('tables retain rows, numbers, and escaped vertical bars', () => {
  const blocks = parseAnswer('| 项目 | 数值 |\n| --- | --- |\n| A \\| B | 12.5 |\n| C | 0 |');
  assert.deepEqual(blocks[0], { type: 'table', headers: ['项目', '数值'], rows: [['A | B', '12.5'], ['C', '0']] });
});

test('malformed tables retain their original source instead of dropping extra cells', () => {
  const text = '| A | B |\n| --- | --- |\n| 1 | 2 | 3 |';
  const [block] = parseAnswer(text);
  assert.equal(block.type, 'code');
  assert.equal(block.text, text);
  assert.match(block.warning, /列数/);
});

test('chart units, provenance, and finite non-negative numbers are mandatory', () => {
  const good = { title: '比较', unit: '分钟', source: '用户输入', values: [{ label: 'A', value: 0 }, { label: 'B', value: 2 }] };
  assert.equal(parseVisual('iui-chart', JSON.stringify(good)).values[0].value, 0);
  for (const invalid of [{ ...good, source: '' }, { ...good, unit: '' }, { ...good, values: [{ label: 'A', value: '2' }, { label: 'B', value: 3 }] }, { ...good, values: [{ label: 'A', value: -1 }, { label: 'B', value: 2 }] }]) {
    assert.throws(() => parseVisual('iui-chart', JSON.stringify(invalid)));
  }
  assert.throws(() => parseVisual('iui-chart', '{"title":"比较","unit":"个","source":"示例","values":[{"label":"A","value":1e309},{"label":"B","value":2}]}'));
});

test('incomplete, invalid, and unsupported visual formats stay readable as source', () => {
  const [incomplete] = parseAnswer('```iui-flow\n{"title":"流程"');
  assert.equal(incomplete.type, 'code');
  assert.match(incomplete.warning, /尚未完整/);
  const [invalid] = parseAnswer('```iui-chart\nnot json\n```');
  assert.equal(invalid.text, 'not json');
  assert.match(invalid.warning, /未转换/);
  const [unknown] = parseAnswer('```iui-html\n{"title":"未知"}\n```');
  assert.match(unknown.warning, /不支持/);
});

test('ordinary code never becomes a flow, heading, or executable HTML', () => {
  const blocks = parseAnswer('```html\n<script>alert(1)</script>\n## not a heading\n```');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code');
  assert.match(blocks[0].text, /<script>/);
  assert.equal(parseAnswer('<img src=x onerror=alert(1)>')[0].type, 'paragraph');
});

test('external URLs reject executable protocols and embedded credentials', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///C:/secret', 'https://user:secret@example.com/a', '/relative', 'https://']) assert.equal(safeUrl(value), null);
  assert.equal(safeUrl('https://example.org/image.png'), 'https://example.org/image.png');
});

test('ordinary statements do not acquire fabricated summaries or charts', () => {
  const blocks = parseAnswer('我觉得方案 A 很好，方案 B 也有优点。');
  assert.deepEqual(blocks, [{ type: 'paragraph', text: '我觉得方案 A 很好，方案 B 也有优点。' }]);
});

test('oversized input is refused before rendering', () => {
  assert.throws(() => parseAnswer('a'.repeat(100001)), /100,000/);
});
