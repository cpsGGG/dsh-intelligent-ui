import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression, evaluateExpression } from '../plugin/expressions.mjs';
import { parseBlock } from '../plugin/schema.mjs';
import { segmentAnswer } from '../plugin/core.mjs';
import { inlineSamples } from '../plugin/samples.mjs';

const calc = (source, values={}) => evaluateExpression(compileExpression(source,Object.keys(values)), values);
test('arithmetic precedence, powers, functions and adjustable formulas are correct', () => {
  assert.equal(calc('total/people',{total:268,people:4}),67);
  assert.equal(calc('total/people',{total:268,people:8}),33.5);
  assert.equal(calc('-2^2 + 3*(2+4)'),14);
  assert.equal(calc('2^3^2'),512);
  assert.equal(calc('max(0,min(12,x))+sqrt(9)+round(.6)+1e-2',{x:20}),16.01);
  assert.ok(Math.abs(calc('sin(pi/2)+log(e)')-2)<1e-12);
});
test('model expressions cannot execute code, inspect properties or exceed bounds', () => {
  for(const source of ['globalThis','alert(1)','x.constructor','x[0]','1;process.exit()','2**3','1 constructor 2','min()','sqrt(1,2)','1 ? 2 : 3','1e999','('.repeat(30)+'1'+')'.repeat(30),'1+'.repeat(100)+'1']) {
    assert.throws(() => calc(source,{x:2}),source);
  }
  for(const source of ['1/0','1%0','sqrt(-1)','exp(1000)','10^16']) assert.throws(()=>calc(source),source);
});
test('all shipped inline examples contain valid components, preserve their source and compute', () => {
  for(const sample of inlineSamples) {
    const blocks=segmentAnswer(sample.source);
    assert.equal(blocks.map(block=>block.raw??block.text).join(''),sample.source);
    assert.ok(blocks.some(block=>block.type!=='markdown'));
    assert.ok(blocks.every(block=>!block.warning), sample.id);
    for(const block of blocks.filter(block=>block.type==='interactive')) {
      const values=Object.fromEntries(block.controls.map(control=>[control.id,control.value]));
      for(const output of block.outputs) assert.ok(Number.isFinite(evaluateExpression(output.ast,values)));
    }
  }
});
test('streaming hides unfinished component JSON while settled malformed output remains available', () => {
  const source=inlineSamples[0].source;
  const start=source.indexOf('```iui-');
  for(let i=start+18;i<source.lastIndexOf('```');i+=13) {
    const partial=source.slice(0,i), blocks=segmentAnswer(partial,{streaming:true});
    assert.equal(blocks.at(-1).type,'pending');
    assert.equal(blocks.map(block=>block.raw??block.text).join(''),partial);
    assert.ok(segmentAnswer(partial).every(block=>block.type==='markdown'));
  }
  const invalid='```iui-interactive\n{"title":"bad"}\n```';
  assert.equal(segmentAnswer(invalid)[0].text,invalid);
  assert.ok(segmentAnswer(invalid)[0].warning);
});
test('component validation rejects missing graph references, executable URLs and invalid inputs', () => {
  assert.throws(()=>parseBlock('iui-gallery',JSON.stringify({title:'images',images:[{title:'x',url:'javascript:alert(1)',sourceUrl:'https://example.com'}]})));
  assert.throws(()=>parseBlock('iui-diagram',JSON.stringify({title:'graph',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{from:'a',to:'missing'}]})));
  assert.throws(()=>parseBlock('iui-interactive',JSON.stringify({title:'x',controls:[{id:'x',type:'number',value:5,min:10,max:20,label:'X'}],outputs:[{label:'answer',expr:'x'}]})));
  assert.throws(()=>parseBlock('iui-interactive',JSON.stringify({title:'x',controls:[{id:'x',type:'number',value:5,label:'X'}],outputs:[{label:'answer',expr:'secret+1'}]})));
  const gallery=parseBlock('iui-gallery',JSON.stringify({title:'images',images:[{title:'x',url:'https://example.com/x.jpg',sourceUrl:'https://example.com',author:'',license:''}]}));
  assert.equal(gallery.images[0].author,'');
});
