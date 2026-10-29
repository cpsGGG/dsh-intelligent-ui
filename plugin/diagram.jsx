import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { diagramLabelLines } from './diagram-labels.mjs';
import { estimatedNodeSize, layoutDiagram, roundedRoute, routePoints } from './diagram-layout.mjs';
export { layoutDiagram } from './diagram-layout.mjs';

const TONES={
  neutral:{background:'var(--diui-diagram-neutral-bg,#f0f3f7)',borderColor:'#b5c0ce',color:'#35445a'},
  blue:{background:'var(--diui-diagram-blue-bg,#eaf3ff)',borderColor:'#a6bedb',color:'#224c7c'},
  green:{background:'var(--diui-diagram-green-bg,#e8f5ee)',borderColor:'#9fc6b1',color:'#285c45'},
  orange:{background:'var(--diui-diagram-orange-bg,#fff3e6)',borderColor:'#dbbb96',color:'#855523'},
};
for(const tone of Object.values(TONES)) tone['--diui-node-ink']=tone.color;

function NodeContent({node,renderText}) {
  const lines=useMemo(()=>diagramLabelLines(node),[node]);
  return <div className="diui-node-content">{lines.map((line,i)=><div key={i} className={line.math?'diui-node-formula':'diui-node-prose'}>{renderText?renderText(line.markdown,{kind:'node',node}):line.source}</div>)}</div>;
}

function useDiagramLayout(block,compact,measureRef,onWidth) {
  const [measurements,setMeasurements]=useState(null);
  const [state,setState]=useState({layout:null,error:false});
  const widthHandler=useRef(onWidth);widthHandler.current=onWidth;
  useLayoutEffect(()=>{
    const root=measureRef.current;
    let active=true,frame;
    const measure=()=>{
      if(!active)return;
      const sizes=new Map();
      for(const node of block.nodes){
        const element=root?.querySelector('[data-measure-id="'+node.id+'"]');
        if(!element)continue;
        const box=element.getBoundingClientRect();
        const estimate=estimatedNodeSize(node,compact);
        sizes.set(node.id,box.width&&box.height?{width:Math.ceil(Math.max(box.width,element.scrollWidth)),height:Math.ceil(Math.max(box.height,element.scrollHeight))}:estimate);
      }
      const signature=JSON.stringify([...sizes]);
      setMeasurements(previous=>previous?.block===block&&previous.signature===signature?previous:{sizes,signature,block});
    };
    const queue=()=>{
      if(typeof requestAnimationFrame==='function'){cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);}else measure();
    };
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(queue):null;
    root?.querySelectorAll('[data-measure-id]').forEach(element=>observer?.observe(element));
    measure();
    document.fonts?.ready.then(()=>{if(active)queue();});
    return()=>{active=false;observer?.disconnect();if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);};
  },[block,compact,measureRef]);
  useEffect(()=>{
    if(!measurements || measurements.block!==block)return;
    let active=true;
    layoutDiagram(block,{compact,measurements:measurements.sizes}).then(layout=>{
      if(!active)return;
      setState({layout,error:false});widthHandler.current?.(layout.width);
    },()=>{if(active)setState({layout:null,error:true});});
    return()=>{active=false;};
  },[block,compact,measurements]);
  return state;
}

/** Labels use the host's math renderer and are measured before routing any arrows. */
export function Diagram({block,compact=false,renderText,onWidth}) {
  const measureRef=useRef(null);
  const {layout,error}=useDiagramLayout(block,compact,measureRef,onWidth);
  const [selected,setSelected]=useState(null);
  const node=block.nodes.find(item=>item.id===selected);
  const id='diui-graph-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const text=(value,kind)=>renderText?renderText(value,{kind}):value;
  const toggle=id=>setSelected(old=>old===id?null:id);
  return <figure className={'diui-architecture-panel'+(compact?' diui-architecture-compact':'')}>
    <figcaption id={id+'-title'} className="diui-architecture-title">{text(block.title,'title')}</figcaption>
    <div className="diui-diagram-measure" ref={measureRef} aria-hidden="true">
      {block.nodes.map(item=><div key={item.id} data-measure-id={item.id} className="diui-architecture-node diui-measure-node" style={{minWidth:compact?82:100,maxWidth:compact?240:300,...TONES[item.tone??'neutral']}}><NodeContent node={item} renderText={renderText}/></div>)}
    </div>
    <span id={id+'-connections'} className="diui-sr-only">{block.edges.map(edge=>block.nodes.find(node=>node.id===edge.from).label+' → '+block.nodes.find(node=>node.id===edge.to).label).join('；')}</span>
    {layout?<div className="diui-architecture-scroll" tabIndex={0} role="region" aria-label={block.title+'结构图'} aria-describedby={id+'-connections'}>
      <div className="diui-architecture-canvas" style={{width:layout.width,height:layout.height}}>
        <svg className="diui-architecture-svg" width={layout.width} height={layout.height} viewBox={'0 0 '+layout.width+' '+layout.height} aria-hidden="true">
          <defs><marker id={id+'-arrow'} viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="var(--diui-diagram-edge,#8c98a8)" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round"/></marker></defs>
          {layout.edges.map(edge=><g key={edge.id} className="diui-architecture-edge" data-edge-from={edge.from} data-edge-to={edge.to}>
            {edge.sections.map((section,j)=><path key={j} d={roundedRoute(routePoints(section))} fill="none" stroke="var(--diui-diagram-edge,#8c98a8)" strokeWidth="1.15" markerEnd={'url(#'+id+'-arrow)'} vectorEffect="non-scaling-stroke"/>)}
            {edge.labels.map((label,j)=><g key={j}><rect x={label.x-3} y={label.y} width={label.width+6} height={label.height} fill="var(--diui-paper,#fff)"/><text x={label.x+label.width/2} y={label.y+16} textAnchor="middle" fill="var(--diui-muted,#6f7c88)" fontSize="13">{label.text}</text></g>)}
          </g>)}
        </svg>
        {block.nodes.map(item=>{const position=layout.positions.get(item.id);return <div key={item.id} role="button" tabIndex={0} aria-label={item.label} aria-pressed={selected===item.id} data-node-id={item.id}
          className="diui-architecture-node diui-graph-node" style={{left:position.x,top:position.y,width:position.width,height:position.height,...TONES[item.tone??'neutral']}}
          onClick={()=>toggle(item.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle(item.id);}}}>
          <NodeContent node={item} renderText={renderText}/>
        </div>;})}
      </div>
    </div>:error?<div className="diui-notice" role="status">结构图暂时无法布局。{block.nodes.map(item=><div key={item.id}>{item.label}</div>)}</div>:<div className="diui-diagram-loading" role="status">正在整理结构图…</div>}
    {node?.detail&&<div className="diui-architecture-detail diui-node-detail" aria-live="polite"><strong>{text(node.label,'detail-title')}</strong><div>{text(node.detail,'detail')}</div></div>}
    {block.caption&&<div className="diui-architecture-caption">{text(block.caption,'caption')}</div>}
  </figure>;
}

export function CompareDiagram({block,renderText}) {
  const panels=useMemo(()=>block.panels.map(panel=>({...panel,direction:'down'})),[block.panels]);
  const [widths,setWidths]=useState([360,360]);
  const widthCallbacks=useMemo(()=>[0,1].map(index=>value=>setWidths(previous=>previous[index]===value?previous:previous.map((width,i)=>i===index?value:width))),[]);
  const minimum=Math.max(320,...widths)+24;
  return <figure className="diui-comparison">
    <figcaption className="diui-comparison-title">{renderText?renderText(block.title,{kind:'title'}):block.title}</figcaption>
    <div className="diui-comparison-panels" style={{gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, '+minimum+'px), 1fr))'}}>
      {panels.map((panel,i)=><Diagram key={i} block={panel} compact renderText={renderText} onWidth={widthCallbacks[i]}/>)}
    </div>
    {block.caption&&<div className="diui-architecture-caption">{renderText?renderText(block.caption,{kind:'caption'}):block.caption}</div>}
  </figure>;
}
