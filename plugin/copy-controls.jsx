import React,{useEffect,useRef,useState} from 'react';
import {copyPng,imageToPng,figureToPng,copyErrorMessage} from './clipboard.mjs';

export function CopyImageButton({makeBlob,label='复制图片'}){
  const [state,setState]=useState('idle'),[error,setError]=useState(''),busy=useRef(false),mounted=useRef(true),timer=useRef();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current);};},[]);
  const copy=async event=>{
    event.preventDefault();event.stopPropagation();if(busy.current)return;
    busy.current=true;setState('copying');setError('');clearTimeout(timer.current);
    try{await copyPng(makeBlob);if(mounted.current){setState('copied');timer.current=setTimeout(()=>setState('idle'),2500);}}
    catch(cause){if(mounted.current){setState('idle');setError(copyErrorMessage(cause));}}
    finally{busy.current=false;}
  };
  return <><button type="button" className="diui-copy-button" data-iui-copy-ignore="true" aria-label={label} title={label+'，可粘贴到微信或文档'} disabled={state==='copying'} onClick={copy}>
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="6" y="6" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M13 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.4"/></svg>
    <span aria-live="polite">{state==='copying'?'正在复制…':state==='copied'?'已复制':label}</span>
  </button>{error&&<span className="diui-copy-error" role="alert" data-iui-copy-ignore="true">{error}</span>}</>;
}

export function CopyFigure({children}){
  const ref=useRef(null);
  return <div className="diui-exportable" data-iui-copy-surface="true"><div className="diui-copybar"><CopyImageButton makeBlob={()=>figureToPng(ref.current?.firstElementChild)}/></div><div className="diui-copy-content" ref={ref}>{children}</div></div>;
}

/** Overlay controls as React siblings, preserving native image preview and attachment loaders. */
export function ImageCopyLayer({children}){
  const root=useRef(null),[images,setImages]=useState([]),ids=useRef(new WeakMap()),nextId=useRef(1);
  useEffect(()=>{
    const host=root.current;if(!host)return;
    let frame,active=true;const observed=new Set();
    const measure=()=>{
      if(!active)return;
      const base=host.getBoundingClientRect();
      const entries=[...host.querySelectorAll('img')].filter(img=>img.complete&&img.naturalWidth&&!img.closest('[data-iui-copy-surface],.diui-diagram-measure')).flatMap(img=>{
        const box=img.getBoundingClientRect();if(box.width<48||box.height<40)return [];
        if(!ids.current.has(img))ids.current.set(img,nextId.current++);
        return [{image:img,id:ids.current.get(img),src:img.currentSrc||img.src,left:Math.round(box.right-base.left-6),top:Math.round(box.top-base.top+6)}];
      });
      setImages(old=>old.length===entries.length&&old.every((v,i)=>v.image===entries[i].image&&v.src===entries[i].src&&v.left===entries[i].left&&v.top===entries[i].top)?old:entries);
      const current=new Set(entries.map(entry=>entry.image));
      for(const img of observed)if(!current.has(img)){resize?.unobserve(img);observed.delete(img);}
      for(const img of current)if(!observed.has(img)){resize?.observe(img);observed.add(img);}
    };
    const queue=()=>{if(typeof requestAnimationFrame==='function'){cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);}else measure();};
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(queue):null;resize?.observe(host);
    const observer=typeof MutationObserver==='function'?new MutationObserver(queue):null;
    observer?.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['src','class','style','hidden']});
    host.addEventListener('load',queue,true);host.addEventListener('scroll',queue,true);measure();
    return()=>{active=false;resize?.disconnect();observer?.disconnect();host.removeEventListener('load',queue,true);host.removeEventListener('scroll',queue,true);if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);};
  },[]);
  return <div ref={root} className="diui-image-actions">{children}{images.map(item=><div className="diui-image-copy-anchor" key={item.id+item.src} style={{left:item.left,top:item.top}}><CopyImageButton makeBlob={()=>imageToPng(item.image)}/></div>)}</div>;
}
