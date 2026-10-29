import ELK from 'elkjs/lib/elk.bundled.js';
import { diagramLabelLines } from './diagram-labels.mjs';

const elk=new ELK({algorithms:['layered']});
const cache=new Map();

export function estimatedNodeSize(node,compact=false) {
  const lines=diagramLabelLines(node);
  const width=Math.max(compact?82:100,Math.min(compact?240:300,Math.max(...lines.map(line=>[...line.source].reduce((n,c)=>n+(c.codePointAt(0)>0x2e7f?16:8.2),28)))));
  const height=24+lines.reduce((n,line)=>n+(line.math&&/\\frac|\\sum|\\sqrt/.test(line.markdown)?38:24),0);
  return {width:Math.ceil(width),height:Math.max(54,height)};
}

/** One shared layered layout optimizes node order, port order and orthogonal routes together. */
export async function layoutDiagram(block,{compact=false,measurements}={}) {
  const children=block.nodes.map(node=>{
    const size=measurements?.get(node.id)??estimatedNodeSize(node,compact);
    return {id:node.id,width:Math.max(54,size.width),height:Math.max(42,size.height)};
  });
  const graph={id:'answer-graph',layoutOptions:{
    'elk.algorithm':'layered',
    'elk.direction':block.direction==='right'?'RIGHT':'DOWN',
    'elk.edgeRouting':'ORTHOGONAL',
    'elk.padding':'[top=14,left=14,bottom=14,right=14]',
    'elk.spacing.nodeNode':compact?'26':'36',
    'elk.layered.spacing.nodeNodeBetweenLayers':'42',
    'elk.layered.spacing.edgeNodeBetweenLayers':'16',
    'elk.layered.spacing.edgeEdgeBetweenLayers':'12',
    'elk.spacing.edgeNode':'16',
    'elk.spacing.edgeEdge':'12',
    'elk.layered.crossingMinimization.strategy':'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy':'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.edgeStraightening':'IMPROVE_STRAIGHTNESS',
    'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES',
    'elk.layered.thoroughness':'12',
    'elk.randomSeed':'4',
    'elk.separateConnectedComponents':'false',
  },children,edges:block.edges.map((edge,index)=>({id:'e'+index,sources:[edge.from],targets:[edge.to],
    ...(edge.label?{labels:[{text:edge.label,width:Math.min(240,edge.label.length*14+12),height:24}]}:{}),
  }))};
  const key=JSON.stringify(graph);
  if(cache.has(key))return cache.get(key);
  const pending=elk.layout(graph).then(result=>({
    width:Math.ceil(result.width),height:Math.ceil(result.height),
    positions:new Map(result.children.map(node=>[node.id,{x:node.x,y:node.y,width:node.width,height:node.height}])),
    edges:result.edges.map(edge=>({id:edge.id,from:edge.sources[0],to:edge.targets[0],sections:edge.sections??[],labels:edge.labels??[]})),
  }));
  cache.set(key,pending);
  if(cache.size>48)cache.delete(cache.keys().next().value);
  try{return await pending;}catch(error){cache.delete(key);throw error;}
}

/** Small, rounded right-angle bends; never a freehand diagonal across another layer. */
export function roundedRoute(points,radius=5) {
  if(points.length<2)return '';
  let path='M'+points[0].x+','+points[0].y;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1];
    const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(radius,ab/2,bc/2);
    if(!r)continue;
    const p={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab};
    const q={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};
    path+=' L'+p.x+','+p.y+' Q'+b.x+','+b.y+' '+q.x+','+q.y;
  }
  const last=points.at(-1);return path+' L'+last.x+','+last.y;
}

export const routePoints=section=>[section.startPoint,...(section.bendPoints??[]),section.endPoint];
