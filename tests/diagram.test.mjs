import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import katex from 'katex';
import {parseDiagram,parseComparison} from '../plugin/diagram-schema.mjs';
import {layoutDiagram,roundedRoute,routePoints} from '../plugin/diagram-layout.mjs';
import {diagramLabelLine,diagramLabelLines} from '../plugin/diagram-labels.mjs';
import {standardAttention,linearAttention} from './fixtures/attention.mjs';

test('schema accepts formula and meta, preserves legacy labels and rejects invalid structure',()=>{
  const block=parseDiagram(standardAttention);
  assert.equal(block.direction,'down');assert.equal(block.nodes[0].label,'Q\nN×dₖ');
  const enriched={...standardAttention,nodes:standardAttention.nodes.map(n=>({...n,formula:'\\frac{x}{y}',meta:'N×d',script:'bad'}))};
  assert.equal(parseDiagram(enriched).nodes[0].formula,'\\frac{x}{y}');
  assert.equal(parseDiagram(enriched).nodes[0].script,undefined);
  for(const change of [
    {direction:'diagonal'},{nodes:[block.nodes[0]]},{nodes:Array.from({length:25},(_,i)=>({id:'n'+i,label:'node'}))},
    {edges:[]},{edges:Array.from({length:49},()=>block.edges[0])},{edges:[{from:'q',to:'missing'}]},
    {nodes:[{id:'q',label:'Q'},{id:'q',label:'K'}]},
    {nodes:[{id:'q',label:'x'.repeat(81)},{id:'k',label:'K'}]},
    {nodes:[{id:'q',label:'Q',tone:'url(javascript:bad)'},{id:'k',label:'K'}]},
  ])assert.throws(()=>parseDiagram({...standardAttention,...change}));
  assert.throws(()=>parseComparison({title:'bad',panels:[standardAttention]}));
  assert.equal(parseComparison({title:'compare',panels:[standardAttention,linearAttention]}).panels.length,2);
});

test('screenshot labels compile fractions, roots, transposes, primes and subscripts, retaining prose',()=>{
  assert.match(diagramLabelLine('QKᵀ / √dₖ').markdown,/\\frac\{QK\^\{\\mathsf\{T\}\}\}\{\\sqrt\{d_\{k\}\}\}/);
  assert.match(diagramLabelLine('输出投影 W_O').markdown,/输出投影 \$\\displaystyle W_\{O\}\$/);
  assert.match(diagramLabelLine('exp / 行和').markdown,/\\frac\{\\exp\}\{\\text\{行和\}\}/);
  assert.match(diagramLabelLine('N×d′ · O(Nd′)').markdown,/d'/);
  assert.equal(diagramLabelLine('Parallel Prefix Scan').math,false);
  assert.equal(diagramLabelLine('Mask + Softmax').math,false);
  for(const node of [...standardAttention.nodes,...linearAttention.nodes]){
    for(const line of diagramLabelLines(node)){
      for(const [,tex] of line.markdown.matchAll(/\$([^$]+)\$/g)){
        assert.doesNotThrow(()=>katex.renderToString(tex,{throwOnError:true,strict:'error',trust:false}),line.source);
      }
    }
  }
  const explicit=diagramLabelLines({label:'当前输出',formula:'\\frac{\\phi(q_t)^\\top S_t}{\\phi(q_t)^\\top z_t}',meta:'N×d'});
  assert.equal(explicit.length,3);assert.match(explicit[1].markdown,/\\frac/);
});

function assertClearLayout(block,layout){
  assert.ok(layout.width>0&&layout.height>0);
  for(const [id,a] of layout.positions){
    for(const value of Object.values(a))assert.ok(Number.isFinite(value)&&value>=0);
    assert.ok(a.x+a.width<=layout.width&&a.y+a.height<=layout.height);
    for(const [other,b] of layout.positions)if(id!==other)assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'nodes overlap');
  }
  assert.deepEqual(layout.edges.map(e=>[e.from,e.to]),block.edges.map(e=>[e.from,e.to]));
  for(const edge of layout.edges){
    assert.ok(edge.sections.length>0);
    for(const section of edge.sections){
      const points=routePoints(section);
      assert.doesNotMatch(roundedRoute(points),/NaN|Infinity|undefined/);
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i];assert.ok(Math.abs(a.x-b.x)<1e-6||Math.abs(a.y-b.y)<1e-6,'every segment is orthogonal');
        for(const [id,n] of layout.positions){
          if(id===edge.from||id===edge.to)continue;
          const hits=Math.abs(a.x-b.x)<1e-6?a.x>n.x&&a.x<n.x+n.width&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+n.height:a.y>n.y&&a.y<n.y+n.height&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+n.width;
          assert.equal(hits,false,edge.from+' → '+edge.to+' hits '+id);
        }
      }
    }
  }
}
test('screenshot graphs have deterministic orthogonal routes, disjoint nodes and clear intermediate nodes',async()=>{
  for(const source of [standardAttention,linearAttention])for(const direction of ['down','right']){
    const block=parseDiagram({...source,direction}),layout=await layoutDiagram(block);
    assertClearLayout(block,layout);assert.deepEqual(await layoutDiagram(block),layout);
  }
});
test('measured mathematical labels determine layout dimensions without shrinking type',async()=>{
  const block=parseDiagram(linearAttention),measurements=new Map(block.nodes.map(n=>[n.id,{width:n.id==='s'?310:170,height:94}]));
  const layout=await layoutDiagram(block,{compact:true,measurements});
  assert.equal(layout.positions.get('s').width,310);assert.equal(layout.positions.get('s').height,94);assertClearLayout(block,layout);
});
test('cycles, self loops and disconnected nodes retain finite visible geometry',async()=>{
  const block=parseDiagram({title:'循环',nodes:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'独立'}],edges:[{from:'a',to:'b'},{from:'b',to:'a'},{from:'a',to:'a'}]});
  assertClearLayout(block,await layoutDiagram(block));
});

const require=createRequire(import.meta.url);
const dep=name=>process.env.DSH_BUILD_DEPS?require(join(process.env.DSH_BUILD_DEPS,name)):require(name);
let deps;
try{deps={React:dep('react'),jsx:dep('react/jsx-runtime'),esbuild:dep('esbuild'),JSDOM:dep('jsdom').JSDOM};}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
test('native math labels, asynchronous relayout, comparison columns and keyboard details work in React',{skip:deps?false:'Requires React, esbuild and jsdom via DSH_BUILD_DEPS'},async()=>{
  const {React,jsx,esbuild,JSDOM}=deps,h=React.createElement;
  const built=await esbuild.build({entryPoints:[fileURLToPath(new URL('../plugin/diagram.jsx',import.meta.url))],bundle:true,write:false,platform:'browser',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime']});
  const module={exports:{}};
  new Function('require','module','exports',built.outputFiles[0].text)(name=>name==='react'?React:name==='react/jsx-runtime'?jsx:require(name),module,module.exports);
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'}),previous={};
  for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
  const {createRoot}=dep('react-dom/client'),{Simulate}=dep('react-dom/test-utils'),{act}=React;
  const root=createRoot(document.getElementById('root')),renderText=value=>h('span',{'data-math-markdown':''},value);
  const ready=async count=>{for(let i=0;i<80;i++){if(document.querySelectorAll('.diui-architecture-svg').length===count&&!document.querySelector('.diui-diagram-loading'))return;await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));}assert.fail('layout did not finish');};
  try{
    await act(async()=>root.render(h(module.exports.Diagram,{block:parseDiagram(linearAttention),renderText})));await ready(1);
    assert.match(document.querySelector('[data-node-id=s]').textContent,/\\mathsf\{T\}/);
    assert.match(document.querySelector('[data-node-id=out]').textContent,/W_\{O\}/);
    const q=document.querySelector('[data-node-id=q]');
    await act(async()=>Simulate.click(q));assert.match(document.querySelector('.diui-node-detail').textContent,/聚合后的状态/);
    await act(async()=>Simulate.keyDown(q,{key:'Enter',preventDefault(){}}));assert.equal(document.querySelector('.diui-node-detail'),null);
    const reversed=parseDiagram({...linearAttention,edges:linearAttention.edges.map(e=>({from:e.to,to:e.from}))});
    await act(async()=>root.render(h(module.exports.Diagram,{block:reversed,renderText})));
    for(let i=0;i<80&&!document.querySelector('[data-edge-from=s][data-edge-to=k]');i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));
    assert.ok(document.querySelector('[data-edge-from=s][data-edge-to=k]'));
    await act(async()=>root.render(h(module.exports.CompareDiagram,{block:parseComparison({title:'两种结构',panels:[standardAttention,linearAttention]}),renderText})));await ready(2);
    assert.equal(new Set([...document.querySelectorAll('marker')].map(n=>n.id)).size,2);
    assert.match(document.querySelector('.diui-comparison-panels').getAttribute('style'),/minmax\(min\(100%,/);
    assert.equal(document.querySelectorAll('img,canvas,foreignObject').length,0);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
