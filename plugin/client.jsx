import React, { useState } from 'react';
import { RichAnswer, Attachment } from './blocks.jsx';
import { registerAssistantNode } from './assistant-node.jsx';
import { watchPluginEnabled } from './client-lifecycle.mjs';
import { registerModeSwitch } from './mode-switch.jsx';
import { createModeStore } from './mode-store.mjs';
import { inlineSamples } from './samples.mjs';
import { ImageCopyLayer } from './copy-controls.jsx';
import css from './reader.css';

const ID = 'dsh-intelligent-ui';
function VisualIcon({ size=20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5"/><path d="M7 16v-4m5 4V7m5 9v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function Examples({ close }) {
  const [index,setIndex] = useState(0); const sample=inlineSamples[index];
  return <div className="diui diui-demo">
    <div className="diui-appbar"><span><VisualIcon/><strong>dsh-intelligent-ui</strong><small>0.6.1</small></span><button onClick={close}>返回会话</button></div>
    <div className="diui-demo-intro"><h1>回答，也可以直接操作。</h1><p>在对话输入框下方，一键开关 Intelligent UI。开启后，DSH 会按问题选择图表、图片或交互组件，直接显示在回答中。这里是组件效果示例。</p></div>
    <nav className="diui-examples" aria-label="交互示例">{inlineSamples.map((item,i) => <button key={item.id} aria-pressed={i===index} onClick={() => setIndex(i)}>{item.label}</button>)}</nav>
    <div className="diui-example-answer"><p className="diui-example-question">{sample.question}</p><ImageCopyLayer><RichAnswer key={sample.id} text={sample.source} scopeKey={'demo:'+sample.id}/></ImageCopyLayer></div>
  </div>;
}
function mountInterface(ctx) {
  // One Cordis effect owns every visible surface. Generator cleanup also rolls
  // back earlier registrations if a later registration fails during startup.
  return ctx.effect(function* () {
    const tag=document.createElement('style'); tag.dataset.plugin=ID; tag.textContent=css; document.head.append(tag);
    yield () => tag.remove();
    const modeStore = createModeStore(ctx.configForms);
    yield () => modeStore.dispose();
    yield registerModeSwitch(ctx, modeStore);
    yield registerAssistantNode(ctx,{RichAnswer,Attachment,ImageActions:ImageCopyLayer});
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist',id:ID,order:35,label:'Intelligent UI'}, () => <VisualIcon/>));
    yield ctx.slots.inject('main', () => ctx.slots.register({name:'main',key:ID}, () => <Examples close={() => ctx.layout.selectPanel(null)}/>));
  }, ID+': active interface');
}
export const inject = ['slots','locale','layout','remote','remote.pluginManager','configForms'];
export function apply(ctx) {
  return ctx.effect(() => watchPluginEnabled(ctx, {
    bundleName: ID,
    mount: () => mountInterface(ctx),
    onError: error => ctx.logger.warn('Intelligent UI lifecycle: %s', error instanceof Error ? error.message : String(error)),
  }), ID+': enabled state');
}
