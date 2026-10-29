import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { inlineSamples } from '../plugin/samples.mjs';

const localRequire=createRequire(import.meta.url);
const dep=name=>process.env.DSH_BUILD_DEPS ? localRequire(join(process.env.DSH_BUILD_DEPS,name)) : localRequire(name);
let deps;
try { deps={React:dep('react'),jsx:dep('react/jsx-runtime'),esbuild:dep('esbuild'),JSDOM:dep('jsdom').JSDOM}; } catch(error) { if(error.code!=='MODULE_NOT_FOUND')throw error; }
test('actual React controls update, reset, persist per answer and support tabs, diagrams and checklists', {skip:deps?false:'Requires React, esbuild and jsdom via DSH_BUILD_DEPS'}, async () => {
  const {React,jsx,esbuild,JSDOM}=deps;
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'});
  const previous={};
  for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) { previous[name]=Object.getOwnPropertyDescriptor(globalThis,name); Object.defineProperty(globalThis,name,{value,writable:true,configurable:true}); }
  const {createRoot}=dep('react-dom/client'); const {act}=React;
  const {Simulate}=dep('react-dom/test-utils');
  const built=await esbuild.build({entryPoints:[new URL('../plugin/blocks.jsx',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','@deepseek-ai/dsh-client-ui-primitives']});
  const module={exports:{}};
  new Function('require','module','exports',built.outputFiles[0].text)(name=> {
    if(name==='react')return React;
    if(name==='react/jsx-runtime')return jsx;
    if(name==='@deepseek-ai/dsh-client-ui-primitives')return {MarkdownText:({text})=>React.createElement('div',{'data-native-md':''},text)};
    throw new Error(name);
  },module,module.exports);
  const root=createRoot(document.getElementById('root')); const h=React.createElement;
  const render=async (index,scope='one')=>act(async()=>root.render(h(module.exports.RichAnswer,{key:scope+index,text:inlineSamples[index].source,scopeKey:scope})));
  const result=()=>document.querySelector('.diui-results output')?.textContent;
  const click=async element=>act(async()=>element instanceof dom.window.SVGElement ? Simulate.click(element) : element.click());
  const waitForDiagrams=async count=>{for(let i=0;i<80;i++){if(document.querySelectorAll('.diui-architecture-svg').length===count)return;await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));}assert.fail('diagram layout did not finish');};
  try {
    await render(0); assert.equal(result(),'67元');
    const people=document.querySelector('input[type=range]');
    await act(async()=>Simulate.change(people,{target:{value:'8'}})); assert.equal(result(),'33.5元');
    await render(0,'two'); assert.equal(result(),'67元');
    await render(0,'one'); assert.equal(result(),'33.5元');
    await click(document.querySelector('.diui-reset')); assert.equal(result(),'67元');
    await act(async()=>Simulate.change(document.querySelector('input[type=number]'),{target:{value:''}}));
    assert.match(document.querySelector('[role=status]').textContent,/请补全/);
    await click(document.querySelector('.diui-reset'));
    await render(1); await waitForDiagrams(1); const nodes=[...document.querySelectorAll('.diui-graph-node')];
    await click(nodes.find(node=>node.getAttribute('aria-label')==='刹车')); assert.match(document.querySelector('.diui-node-detail').textContent,/阻力/);
    await render(2); const tabs=[...document.querySelectorAll('[role=tab]')];
    await click(tabs[1]); assert.match(document.querySelector('[role=tabpanel]').textContent,/35/);
    await act(async()=>Simulate.keyDown(document.querySelector('[role=tablist]'),{key:'End',preventDefault(){}}));
    assert.equal(document.activeElement.textContent,'下一步'); assert.equal(document.querySelector('[aria-selected=true]').textContent,'下一步');
    await render(3); await click(document.querySelector('input[type=checkbox]')); assert.equal(document.querySelector('.diui-checklist .diui-unit').textContent,'1 / 4');
    await render(0); await render(3); assert.equal(document.querySelector('input[type=checkbox]').checked,true);
    await click(document.querySelector('.diui-source-control button')); assert.equal(document.querySelector('.diui-raw').textContent,inlineSamples[3].source);
    await render(4); await waitForDiagrams(2); assert.equal(document.querySelectorAll('.diui-comparison-panels .diui-architecture-svg').length,2);
    assert.match(document.querySelector('[data-native-md]').textContent,/注意力/);
    const oldFormula='定义核函数：\n\n```\nk(q, k) = φ(q)^T φ(k)\n```';
    await act(async()=>root.render(h(module.exports.RichAnswer,{key:'legacy-math',text:oldFormula})));
    assert.match(document.querySelector('[data-native-md]').textContent,/\\mathsf\{T\}/);
    assert.doesNotMatch(document.querySelector('[data-native-md]').textContent,/```/);
    await click(document.querySelector('.diui-source-control button'));
    assert.equal(document.querySelector('.diui-raw').textContent,oldFormula);
  } finally {
    await act(async()=>root.unmount()); dom.window.close();
    for(const [name,descriptor] of Object.entries(previous)) { if(descriptor)Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name]; }
  }
});
