// Small, non-executable adapter for synthetic documentation examples only.
// Production replies always use DSH's native MarkdownText renderer.
import React from 'react';
import katex from 'katex';

export function MarkdownText({ text }) {
  const parts = String(text).split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  return <div className="demo-markdown">{parts.map((part, index) => {
    if (part.startsWith('$')) return <span key={index} dangerouslySetInnerHTML={{ __html: katex.renderToString(
      part.replace(/^\$\$?|\$\$?$/g, ''), { displayMode: part.startsWith('$$'), throwOnError: false, trust: false },
    ) }}/>;
    return <span key={index}>{part.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, i) => piece.startsWith('**')
      ? <strong key={i}>{piece.slice(2, -2)}</strong> : piece.startsWith('`') ? <code key={i}>{piece.slice(1, -1)}</code> : piece)}</span>;
  })}</div>;
}
