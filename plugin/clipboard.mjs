import {toBlob} from 'html-to-image';

const MAX_BYTES=32*1024*1024,MAX_PIXELS=24_000_000;
export class CopyImageError extends Error {}
const fail=message=>new CopyImageError(message);
export function copyErrorMessage(error){
  if(error instanceof CopyImageError)return error.message;
  if(error?.name==='NotAllowedError')return '未能写入剪贴板，请保持窗口在前台后重试。';
  return '图片复制失败，请重试；外部图片也可以打开来源后复制。';
}

/** Start the clipboard write inside the click gesture, before asynchronous rendering. */
export async function copyPng(makeBlob,{clipboard=globalThis.navigator?.clipboard,Item=globalThis.ClipboardItem,maxWaitMs=25000}={}){
  if(!clipboard?.write||!Item)throw fail('当前环境不支持复制图片。请在 DSH 桌面端尝试。');
  const pending=Promise.resolve().then(makeBlob).then(blob=>{
    if(!blob||blob.type!=='image/png'||!blob.size)throw fail('未能生成图片，请重试。');
    if(blob.size>MAX_BYTES)throw fail('图片过大，请分别复制其中的小图。');
    return blob;
  });
  // A clipboard rejection must not leave an unhandled rendering rejection.
  pending.catch(()=>{});
  let timer;
  try{
    const write=clipboard.write([new Item({'image/png':pending})]);
    await Promise.race([write,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('复制等待超时，请保持窗口在前台后重试。')),maxWaitMs);})]);
  }finally{clearTimeout(timer);}
}

export function allowedImageSource(value,base){
  try{
    const url=new URL(value,base);
    if(url.username||url.password)return false;
    return ['http:','https:','blob:'].includes(url.protocol)||/^data:image\/(?:png|jpeg|webp|gif|avif);/i.test(value)||url.href.startsWith('dsh-app://app/api/file?');
  }catch{return false;}
}

export async function imageToPng(image){
  const src=image.currentSrc||image.src;
  if(!allowedImageSource(src,image.ownerDocument.baseURI))throw fail('这张图片的地址不支持复制。');
  const response=await fetch(src,{signal:AbortSignal.timeout(15000),credentials:'same-origin',referrerPolicy:'no-referrer'});
  if(!response.ok)throw fail('无法读取图片，请打开原图后重试。');
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw fail('图片过大，请打开原图另存。');
  const blob=await response.blob();
  if(blob.size>MAX_BYTES)throw fail('图片过大，请打开原图另存。');
  const bitmap=await createImageBitmap(blob);
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>MAX_PIXELS)throw fail('图片尺寸过大，请打开原图另存。');
    if(blob.type==='image/png')return blob;
    const canvas=image.ownerDocument.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');if(!context)throw fail('当前环境无法转换图片。');
    context.drawImage(bitmap,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(fail('无法生成 PNG 图片。')),'image/png'));
  }finally{bitmap.close();}
}

/** Clone outside the viewport; never resize or change the user's displayed diagram. */
export function createExportClone(source){
  const doc=source.ownerDocument,view=doc.defaultView,computed=view.getComputedStyle(source),stage=doc.createElement('div');
  stage.className='diui diui-document diui-export-stage';stage.setAttribute('aria-hidden','true');
  stage.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-1;';
  for(const name of Array.from(computed))if(name.startsWith('--'))stage.style.setProperty(name,computed.getPropertyValue(name));
  for(const name of ['font-family','font-size','font-weight','line-height','color'])stage.style.setProperty(name,computed.getPropertyValue(name));
  stage.style.width=Math.ceil(source.getBoundingClientRect().width)+'px';
  const clone=source.cloneNode(true);clone.style.margin='0';stage.append(clone);
  clone.querySelectorAll('[data-iui-copy-ignore],.diui-diagram-measure,.diui-sr-only,.diui-data').forEach(node=>node.remove());
  // SVG marker IDs stay unique while both the original and temporary copy exist.
  const ids=new Map(),prefix='diui-export-'+Math.random().toString(36).slice(2)+'-';
  clone.querySelectorAll('[id]').forEach(node=>{ids.set(node.id,prefix+node.id);node.id=prefix+node.id;});
  clone.querySelectorAll('*').forEach(node=>{for(const attr of [...node.attributes])if(/url\(#/.test(attr.value))node.setAttribute(attr.name,attr.value.replace(/url\(#([^)]+)\)/g,(all,id)=>ids.has(id)?'url(#'+ids.get(id)+')':all));});
  doc.body.append(stage);
  const originals=[...(source.matches('.diui-architecture-panel')?[source]:source.querySelectorAll('.diui-architecture-panel'))];
  const panels=[...(clone.matches('.diui-architecture-panel')?[clone]:clone.querySelectorAll('.diui-architecture-panel'))];
  panels.forEach((panel,i)=>{
    const scroll=panel.querySelector('.diui-architecture-scroll'),canvas=panel.querySelector('.diui-architecture-canvas');
    if(!scroll||!canvas)return;
    const width=Math.max(originals[i].getBoundingClientRect().width,parseFloat(canvas.style.width)+28);
    panel.style.width=width+'px';panel.style.minWidth=width+'px';panel.style.flex='none';
    scroll.style.overflow='visible';scroll.style.maxWidth='none';
  });
  const grid=clone.querySelector('.diui-comparison-panels');
  if(grid){
    const row=originals.length>1&&Math.abs(originals[0].getBoundingClientRect().top-originals[1].getBoundingClientRect().top)<2;
    grid.style.display='flex';grid.style.flexDirection=row?'row':'column';
    const widths=panels.map(panel=>parseFloat(panel.style.width)),gap=parseFloat(view.getComputedStyle(grid).gap)||20;
    stage.style.width=(row?widths.reduce((sum,n)=>sum+n,0)+gap:Math.max(...widths))+'px';
  }else if(panels.length)stage.style.width=panels[0].style.width;
  clone.style.width='100%';clone.style.maxWidth='none';
  return {stage,clone,dispose:()=>stage.remove()};
}

export async function figureToPng(source){
  if(!source?.isConnected)throw fail('这张图已离开当前页面，请重新打开后复制。');
  if(source.querySelector('.diui-diagram-loading,.diui-notice'))throw fail('请等图形完整显示后再复制。');
  await source.ownerDocument.fonts?.ready;
  const {stage,clone,dispose}=createExportClone(source);
  try{
    const width=Math.ceil(stage.getBoundingClientRect().width),height=Math.ceil(stage.getBoundingClientRect().height);
    if(!width||!height||width*height>MAX_PIXELS||Math.max(width,height)>16000)throw fail('图形过大，请分别复制其中的小图。');
    const ratio=Math.min(2,Math.sqrt(MAX_PIXELS/(width*height)),16000/Math.max(width,height));
    const background=getComputedStyle(stage).getPropertyValue('--diui-paper').trim()||'#fff';
    return await toBlob(clone,{width,height,pixelRatio:ratio,backgroundColor:background,preferredFontFormat:'woff2',fetchRequestInit:{signal:AbortSignal.timeout(15000)},style:{margin:'0'},filter:node=>!node.matches?.('[data-iui-copy-ignore]')});
  }finally{dispose();}
}
