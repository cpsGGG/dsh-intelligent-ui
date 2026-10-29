import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const localRequire = createRequire(import.meta.url);
const requireDependency = name => process.env.DSH_BUILD_DEPS
  ? localRequire(join(process.env.DSH_BUILD_DEPS, name)) : localRequire(name);
let dependencies;
try {
  dependencies = {
    React: requireDependency('react'),
    jsx: requireDependency('react/jsx-runtime'),
    server: requireDependency('react-dom/server'),
    esbuild: requireDependency('esbuild'),
    SlotCore: requireDependency('@deepseek-ai/dsh-client-ui-slots').SlotCore,
  };
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const adapterTest = (name, body) => test(name, {
  skip: dependencies ? false : 'Set DSH_BUILD_DEPS to the installed DSH plugin node_modules (React, esbuild and SlotCore).',
}, body);

let registerAssistantNode;
if (dependencies) {
  const { React, jsx, esbuild } = dependencies;
  const h = React.createElement;
  const primitives = {
    DisclosureRow: ({ title, open, collapsedContent, children }) => h('section', { 'data-disclosure': String(open) }, title, collapsedContent, children),
    IconThinkOutlineRegular: () => h('svg', { 'data-icon': 'think' }),
    TextShimmer: ({ children }) => h('span', null, children),
    MarkdownText: ({ text }) => h('p', { 'data-native-markdown': '' }, text),
    JsonBlock: ({ payload }) => h('pre', { 'data-unknown': '' }, JSON.stringify(payload)),
  };
  const source = readFileSync(new URL('../plugin/assistant-node.jsx', import.meta.url), 'utf8');
  const compiled = esbuild.transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic', target: 'es2020' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsx;
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
    throw new Error(`Unexpected module: ${name}`);
  }, module, module.exports);
  registerAssistantNode = module.exports.registerAssistantNode;
}

const SLOT = 'conversation.chat.node';

function harness({ native = true, policy = { settledReasoningPreview: false }, RichAnswer } = {}) {
  const { React, SlotCore, server } = dependencies;
  const core = new SlotCore();
  const rich = [], attachments = [], factories = [], groups = [], owners = [];
  const presentation = { getSnapshot: () => policy, subscribe: () => () => {} };
  core.register({ name: 'root', children: { [SLOT]: { kind: 'keyed', scope: 'session' } } }, () => null);
  const NativeAssistant = () => React.createElement('p', null, 'native assistant');
  const NativeUser = () => null;
  const NativeTail = () => null;
  core.register({ name: SLOT, key: 'user' }, NativeUser);
  core.register({ name: SLOT, key: 'turn-tail' }, NativeTail);
  if (native) core.register({ name: SLOT, key: 'assistant-step', locale: 'chat',
    children: {
      'conversation.chat.reasoning.body': { kind: 'single', scope: 'session' },
      'conversation.chat.message.images': { kind: 'single', scope: 'session' },
    }, inject: sessionId => ({ hooks: { presentation }, nativeSession: sessionId }),
  }, NativeAssistant);
  const ctx = { slots: {
    entries: key => core.entries(key),
    inject: (_key, callback) => callback(),
    register: (options, component) => core.register(options, component),
  } };
  const dispose = registerAssistantNode(ctx, {
    RichAnswer: RichAnswer ?? (props => { rich.push(props); return React.createElement('p', { 'data-rich': '' }, props.text); }),
    Attachment: props => { attachments.push(props); return React.createElement('img', { alt: 'attachment fallback' }); },
  });
  const entry = () => core.entriesOfSlot(SLOT).find(item => item.options.key === 'assistant-step');
  const mentions = { resolve: () => undefined };
  const loadImage = () => Promise.resolve('native-authorized-image');
  const openFile = () => {};
  const turn = { status: 'closed', turn: 1 };
  const render = (blocks, options = {}) => {
    const inject = entry().inject?.('session-one') ?? {};
    const props = {
      sessionId: 'session-one',
      node: { kind: 'assistant-step', key: 'assistant-1', location: { kind: 'step', turn },
        data: { step: 1, status: 'settled', finalNode: { seq: 7 }, blocks, ...options.data },
      },
      useTurnData: () => options.tail ?? { closing: { finalNode: { seq: 7 } } },
      useDisclosure: () => ({ expanded: options.expanded ?? false, toggle: () => {} }),
      useGroupAction: (hidden, reveal) => { groups.push({ hidden, reveal }); return { current: null }; },
      usePresentation: selector => selector(inject.hooks.presentation.getSnapshot()),
      fileMentions: owner => { owners.push(owner); return mentions; },
      renderFactorySlot: (name, inputs, factoryOptions) => {
        factories.push({ name, inputs });
        return options.noFactories ? factoryOptions.fallback : React.createElement('section', { 'data-factory': name }, inputs.text ?? 'native images');
      },
      t: key => ({ 'message.think': '思考', 'message.stopped': '已停止' })[key] ?? key,
      openFile, loadImage,
      ...options.props,
    };
    return server.renderToStaticMarkup(React.createElement(entry().component, props));
  };
  return { core, dispose, entry, render, rich, attachments, factories, groups, owners, presentation, mentions, loadImage, openFile, turn,
    NativeAssistant, NativeUser, NativeTail };
}

adapterTest('real SlotCore accepts assistant shadow without child ownership collisions and disposal restores native rendering', () => {
  const h = harness();
  assert.equal(h.entry().options.priority, -20);
  assert.equal(h.entry().children, undefined);
  assert.equal(h.entry().inject('s').hooks.presentation, h.presentation);
  assert.equal(h.entry().inject('s').nativeSession, 's');
  assert.equal(h.core.entriesOfSlot(SLOT).find(e => e.options.key === 'user').component, h.NativeUser);
  assert.equal(h.core.entriesOfSlot(SLOT).find(e => e.options.key === 'turn-tail').component, h.NativeTail);
  h.dispose();
  assert.equal(h.entry().component, h.NativeAssistant);
  assert.ok(h.core.spec('conversation.chat.reasoning.body'));
  assert.ok(h.core.spec('conversation.chat.message.images'));
});

adapterTest('only the final closing sequence receives native file-mention authorization', () => {
  const h = harness();
  h.render([{ kind: 'text', text: 'see file' }]);
  assert.equal(h.owners.length, 1);
  assert.equal(h.owners[0].seq, 7);
  assert.equal(h.owners[0].openFile, h.openFile);
  assert.equal(h.rich[0].fileMentions, h.mentions);
  assert.deepEqual(JSON.parse(h.rich[0].scopeKey), ['session-one', 'assistant-1', 0]);
  h.render([{ kind: 'text', text: 'older step' }], { data: { finalNode: { seq: 5 } } });
  h.render([{ kind: 'text', text: 'streaming' }], { data: { status: 'running', finalNode: undefined } });
  h.render([{ kind: 'text', text: 'other closing' }], { tail: { closing: { finalNode: { seq: 10 } } } });
  assert.equal(h.owners.length, 1);
  assert.ok(h.rich.slice(1).every(p => p.fileMentions === undefined));
});

adapterTest('reasoning and response projections do not duplicate each other; hidden reasoning uses the native group hook', () => {
  const blocks = [{ kind: 'reasoning', text: 'native reasoning' }, { kind: 'text', text: 'visible answer' }];
  let revealed;
  const h = harness();
  const props = { groupPart: 'reasoning', turnProcess: { foldable: true, open: false, spec: { answerStep: 1, inlineReasoning: true }, setOpen: value => { revealed = value; } } };
  const reasoning = h.render(blocks, { expanded: true, props });
  assert.equal(h.rich.length, 0);
  assert.match(reasoning, /native reasoning/);
  assert.doesNotMatch(reasoning, /visible answer/);
  assert.equal(h.groups[0].hidden, true);
  h.groups[0].reveal(); assert.equal(revealed, true);
  assert.equal(h.factories[0].name, 'conversation.chat.reasoning.content');
  const response = h.render(blocks, { expanded: true, props: { groupPart: 'response' } });
  assert.match(response, /visible answer/);
  assert.doesNotMatch(response, /native reasoning/);
  assert.equal(h.factories.length, 1);
});

adapterTest('image runs use the official gallery Factory with the same authorized loader and source attachment identities', () => {
  const h = harness();
  const first = { id: 'one' }, second = { id: 'two' }, third = { id: 'three' };
  h.render([{ kind: 'image', attachment: first }, { kind: 'image', attachment: second }, { kind: 'text', text: 'between images' }, { kind: 'image', attachment: third }]);
  assert.deepEqual(h.factories.map(f => f.name), ['conversation.images.content', 'conversation.images.content']);
  assert.equal(h.factories[0].inputs.images[0].attachment, first);
  assert.equal(h.factories[0].inputs.images[1].attachment, second);
  assert.equal(h.factories[1].inputs.images[0].attachment, third);
  assert.equal(h.factories[0].inputs.loadImage, h.loadImage);
  assert.equal(h.factories[0].inputs.align, 'start');
  assert.equal(h.attachments.length, 0);
  h.render([{ kind: 'image', attachment: first }], { noFactories: true });
  assert.equal(h.attachments[0].attachment, first);
  assert.equal(h.attachments[0].loadImage, h.loadImage);
});

adapterTest('streaming and interruption state survive the adapter without rendering tool-call arguments', () => {
  const h = harness();
  const source = 'unfinished ```';
  const html = h.render([{ kind: 'text', text: source }, { kind: 'tool-call', block: { secret: 'tool-only' } }], { data: { status: 'running' } });
  assert.equal(h.rich[0].text, source);
  assert.equal(h.rich[0].streaming, true);
  assert.match(html, /data-streaming="true"/);
  assert.doesNotMatch(html, /tool-only/);
  assert.match(h.render([{ kind: 'text', text: source }], { data: { status: 'interrupted' } }), /已停止/);
  assert.equal(h.render([{ kind: 'tool-call' }]), '');
  const unknown = h.render([{ kind: 'unrecognized', block: { payload: 'kept' } }]);
  assert.match(unknown, /kept/);
});

adapterTest('missing native presentation source falls back conservatively and reasoning still uses native Markdown when Factory is absent', () => {
  const h = harness({ native: false });
  assert.equal(h.entry().inject().hooks.presentation.getSnapshot().settledReasoningPreview, false);
  const html = h.render([{ kind: 'reasoning', text: 'full reasoning' }], { expanded: true, noFactories: true });
  assert.match(html, /data-native-markdown/);
  assert.match(html, /full reasoning/);
});

adapterTest('renderer failures propagate to the host; real SlotCore abdication elects the surviving native assistant', () => {
  const h = harness({ RichAnswer: () => { throw new Error('renderer failure'); } });
  assert.throws(() => h.render([{ kind: 'text', text: 'must not disappear' }]), /renderer failure/);
  const failed = h.entry();
  h.core.reportEntryError(SLOT, failed, new Error('renderer failure'), { abdicate: true });
  assert.equal(h.entry().component, h.NativeAssistant);
  h.dispose();
  assert.equal(h.entry().component, h.NativeAssistant);
});
