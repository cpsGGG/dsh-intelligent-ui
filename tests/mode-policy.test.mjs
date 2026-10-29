import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readMode, isSessionId, validSessionOverrides, MAX_SESSION_OVERRIDES,
  createModeGuardedTool, ORDINARY_ANSWER_STYLE,
} from '../plugin/mode-policy.mjs';

test('known conversations default on, unknown context stays ordinary', () => {
  assert.equal(readMode({}, 'session-one'), true);
  for (const id of [undefined, null, '', '__proto__', 'constructor', 'prototype', '../a', 'a'.repeat(201)]) {
    assert.equal(isSessionId(id), false);
    assert.equal(readMode({}, id), false);
  }
});

test('per-conversation false survives; ordinary and volatile settings share the same result', () => {
  const data = { defaultEnabled: true, sessionOverrides: { one: false, two: true } };
  assert.equal(readMode(data, 'one'), false);
  assert.equal(readMode(data, 'two'), true);
  assert.equal(readMode(data, 'new'), true);
  const config = { defaultEnabled: { get: () => data.defaultEnabled }, sessionOverrides: { get: () => data.sessionOverrides } };
  data.sessionOverrides.one = true;
  assert.equal(readMode(config, 'one'), true);
  data.defaultEnabled = false;
  assert.equal(readMode(config, 'new'), false);
  assert.equal(readMode(config, 'two'), true);
});

test('malformed, inherited, accessor and oversized maps fail closed', () => {
  const oversized = Object.fromEntries(Array.from({ length: MAX_SESSION_OVERRIDES + 1 }, (_, i) => [`s${i}`, true]));
  const accessor = {};
  Object.defineProperty(accessor, 'one', { enumerable: true, get() { throw new Error('must not run getter'); } });
  for (const map of [null, [], { one: 1 }, Object.create({ one: true }), JSON.parse('{"__proto__":true}'), accessor, oversized]) {
    assert.equal(validSessionOverrides(map), false);
    assert.equal(readMode({ sessionOverrides: map }, 'one'), false);
  }
  assert.equal(readMode({ defaultEnabled: 'yes' }, 'one'), false);
  assert.equal(readMode({ sessionOverrides: { get() { throw new Error('unavailable'); } } }, 'one'), false);
});

test('ordinary mode counters historical visual format without the full protocol', () => {
  assert.match(ORDINARY_ANSWER_STYLE, /不要输出任何 iui-\* 围栏/);
  assert.match(ORDINARY_ANSWER_STYLE, /普通 Markdown/);
  assert.doesNotMatch(ORDINARY_ANSWER_STYLE, /```/);
});

test('disabled or unscoped image calls never reach the tool or fetch', () => {
  let starts = 0;
  const createTool = () => ({ name: 'test-image', execute() { starts++; } });
  const tool = createModeGuardedTool(createTool, id => id === 'on');
  assert.throws(() => tool.execute({}, { agent: { session: { id: 'off' } } }), /disabled/);
  assert.throws(() => tool.execute({}, {}), /disabled/);
  assert.equal(starts, 0);
});

test('a toggle rechecks queued image calls and later fetches without affecting another conversation', async () => {
  const enabled = { one: true, two: true };
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const requests = [];
  const createTool = ({ fetchImpl }) => ({
    name: 'test-image',
    async execute(args) {
      await fetchImpl(args.url);
      if (args.wait) await held;
      if (args.again) await fetchImpl(`${args.url}/next`);
      return args.url;
    },
  });
  const tool = createModeGuardedTool(createTool, id => enabled[id] === true, {
    fetchImpl: async url => { requests.push(url); },
  });
  const execution = id => ({ agent: { session: { id } } });
  const first = tool.execute({ url: 'one', wait: true, again: true }, execution('one'));
  const queued = tool.execute({ url: 'queued' }, execution('one'));
  const other = tool.execute({ url: 'two' }, execution('two'));
  const firstRejected = assert.rejects(first, /disabled/);
  const queuedRejected = assert.rejects(queued, /disabled/);
  await Promise.resolve();
  enabled.one = false;
  release();
  await Promise.all([firstRejected, queuedRejected]);
  assert.equal(await other, 'two');
  assert.deepEqual(requests, ['one', 'two']);
});
