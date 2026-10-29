// Browser regression harness: same KaTeX syntax and theme-token inheritance as DSH.
import React from 'react';
import katex from 'katex';
export function MarkdownText({text}){
  const chunks=String(text).split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$)/g);
  return <div className="mock-native-markdown">{chunks.map((chunk,i)=>chunk.startsWith('$')?<span key={i} dangerouslySetInnerHTML={{__html:katex.renderToString(chunk.replace(/^\$\$?|\$\$?$/g,''),{displayMode:chunk.startsWith('$$'),throwOnError:false})}}/>:<span key={i}>{chunk}</span>)}</div>;
}
