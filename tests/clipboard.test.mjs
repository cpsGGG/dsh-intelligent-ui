import test from 'node:test';
import assert from 'node:assert/strict';
import {copyPng,copyErrorMessage,allowedImageSource} from '../plugin/clipboard.mjs';

test('clipboard writes PNG bytes, starts within the gesture and waits for successful write',async()=>{
  let finish,called=false,done=false;
  const png=new Blob(['test-png'],{type:'image/png'}),pending=new Promise(resolve=>finish=resolve);
  class Item{constructor(values){this.values=values;}}
  const task=copyPng(()=>pending,{Item,clipboard:{write:async items=>{called=true;assert.equal(items.length,1);assert.equal(await items[0].values['image/png'],png);done=true;}}});
  assert.equal(called,true);assert.equal(done,false);finish(png);await task;assert.equal(done,true);
});
test('unsupported clipboard, invalid output and write rejection cannot masquerade as copied',async()=>{
  class Item{constructor(values){this.values=values;}}
  await assert.rejects(copyPng(()=>null,{clipboard:null,Item}),/不支持复制/);
  await assert.rejects(copyPng(()=>new Blob(['url'],{type:'text/plain'}),{Item,clipboard:{write:async items=>await items[0].values['image/png']}}),/未能生成/);
  const error=new DOMException('denied','NotAllowedError');
  await assert.rejects(copyPng(()=>new Blob(['PNG'],{type:'image/png'}),{Item,clipboard:{write:()=>Promise.reject(error)}}),{name:'NotAllowedError'});
  assert.match(copyErrorMessage(error),/未能写入剪贴板/);
});
test('image copy accepts displayed image protocols, not executable or credential-bearing sources',()=>{
  for(const url of ['https://example.com/a.png','blob:http://localhost/a','data:image/png;base64,AAAA','dsh-app://app/api/file?path=a.png'])assert.equal(allowedImageSource(url,'http://localhost/'),true);
  for(const url of ['javascript:alert(1)','file:///C:/secret','data:text/html,test','https://user:password@example.com/image.png','dsh-app://app/api/credentials'])assert.equal(allowedImageSource(url,'http://localhost/'),false);
});

test('a clipboard provider that never settles returns an actionable timeout',async()=>{
  class Item{constructor(values){this.values=values;}}
  await assert.rejects(copyPng(()=>new Blob(['PNG'],{type:'image/png'}),{Item,maxWaitMs:10,clipboard:{write:()=>new Promise(()=>{})}}),/等待超时/);
});
