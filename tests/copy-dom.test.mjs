import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createExportClone} from '../plugin/clipboard.mjs';
const localRequire=createRequire(import.meta.url);
const dep=name=>process.env.DSH_BUILD_DEPS?localRequire(join(process.env.DSH_BUILD_DEPS,name)):localRequire(name);
let deps;
try{deps={React:dep('react'),jsx:dep('react/jsx-runtime'),esbuild:dep('esbuild'),JSDOM:dep('jsdom').JSDOM};}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const options={skip:deps?false:'Requires React, esbuild and jsdom via DSH_BUILD_DEPS'};

test('image copy overlays preserve native preview clicks, copy pixels, and dispose observers',options,async()=>{
  const {React,jsx,esbuild,JSDOM}=deps,dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
  const previous={},observers=[];let writes=0,previews=0;
  class Resize{constructor(){observers.push(this);}observe(){}unobserve(){}disconnect(){this.disposed=true;}}
  const png=new Blob(['pixel-data'],{type:'image/png'});
  const globals={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,ResizeObserver:Resize,IS_REACT_ACT_ENVIRONMENT:true};
  for(const [key,value] of Object.entries(globals)){previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  const {createRoot}=dep('react-dom/client'),{act}=React;
  const compiled=esbuild.transformSync(readFileSync(new URL('../plugin/copy-controls.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs',jsx:'automatic'}).code,module={exports:{}};
  new Function('require','module','exports',compiled)(name=>name==='react'?React:name==='react/jsx-runtime'?jsx:{copyPng:async makeBlob=>{assert.equal(await makeBlob(),png);writes++;},imageToPng:async img=>{assert.equal(img.alt,'native picture');return png;},copyErrorMessage:()=> 'error'},module,module.exports);
  const root=createRoot(document.getElementById('root')),h=React.createElement;
  const image=h('img',{alt:'native picture',src:'/native.png',ref:img=>{if(img){Object.defineProperty(img,'complete',{value:true});Object.defineProperty(img,'naturalWidth',{value:1200});img.getBoundingClientRect=()=>({left:0,top:0,right:300,width:300,height:200});}}});
  try{
    await act(async()=>root.render(h(module.exports.ImageCopyLayer,null,h('button',{onClick:()=>previews++,'aria-label':'native preview'},image))));
    assert.equal(document.querySelectorAll('.diui-copy-button').length,1);
    assert.equal(document.querySelector('.diui-copy-button').closest('[aria-label="native preview"]'),null);
    await act(async()=>document.querySelector('.diui-copy-button').click());assert.equal(writes,1);assert.equal(previews,0);assert.match(document.querySelector('.diui-copy-button').textContent,/已复制/);
    await act(async()=>document.querySelector('[aria-label="native preview"]').click());assert.equal(previews,1);
  }finally{await act(async()=>root.unmount());assert.ok(observers.every(o=>o.disposed));dom.window.close();for(const [key,value]of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});

test('export includes offscreen graph width, preserves SVG arrows, and does not mutate the live answer',options,()=>{
  const dom=new deps.JSDOM('<figure id="source" class="diui-architecture-panel"><div class="diui-architecture-scroll"><div class="diui-architecture-canvas" style="width:600px;height:200px"><svg><defs><marker id="arrow"/></defs><path marker-end="url(#arrow)"/></svg></div></div><div class="diui-diagram-measure">hidden</div><button data-iui-copy-ignore>copy</button></figure>');
  const source=dom.window.document.getElementById('source');source.getBoundingClientRect=()=>({width:320,height:220,top:0});
  const original=source.outerHTML,{stage,clone,dispose}=createExportClone(source);
  try{assert.equal(stage.style.width,'628px');assert.equal(source.outerHTML,original);assert.equal(clone.querySelector('.diui-diagram-measure'),null);assert.equal(clone.querySelector('button'),null);const marker=clone.querySelector('marker').id;assert.notEqual(marker,'arrow');assert.equal(clone.querySelector('path').getAttribute('marker-end'),`url(#${marker})`);}finally{dispose();assert.equal(dom.window.document.querySelector('.diui-export-stage'),null);dom.window.close();}
});
