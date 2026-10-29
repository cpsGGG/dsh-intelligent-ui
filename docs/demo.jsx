import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RichAnswer } from '../plugin/blocks.jsx';
import { inlineSamples } from '../plugin/samples.mjs';
import css from '../plugin/reader.css';

function App() {
  const [dark, setDark] = useState(false), [tab, setTab] = useState('overview');
  const samples = tab === 'overview' ? [inlineSamples[0], inlineSamples[2]] : tab === 'architecture' ? [inlineSamples[4]] : [inlineSamples[3]];
  return <main className={'preview ' + (dark ? 'dark' : 'light')}>
    <style>{css}</style><style>{`
      *{box-sizing:border-box}body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif}
      .preview{min-height:100vh;padding:32px 36px 40px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
      .light{--dsw-alias-bg-base:#fafbfc;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f1f4f8;--dsw-alias-label-primary:#202733;--dsw-alias-label-secondary:#667184;--dsw-alias-border-l1:#dde3eb;--dsw-alias-brand-primary:#315fbc}
      .dark{--dsw-alias-bg-base:#141619;--dsw-alias-bg-layer-1:#1c1f24;--dsw-alias-bg-layer-2:#252a32;--dsw-alias-label-primary:#f0f2f6;--dsw-alias-label-secondary:#adb6c5;--dsw-alias-border-l1:#363e49;--dsw-alias-brand-primary:#a3c2ff}
      .preview header{max-width:1180px;margin:0 auto 22px;display:flex;align-items:center;justify-content:space-between;gap:20px}
      .preview h1{font-size:24px;line-height:1.3;margin:0 0 5px;letter-spacing:-.6px}.preview header p{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px}
      .preview button{font:inherit;cursor:pointer}.preview nav{display:flex;gap:5px;flex-wrap:wrap}.preview nav button,.theme-toggle{border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px 12px;font-size:13px}
      .preview nav button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}
      .theme-toggle{border-color:var(--dsw-alias-border-l1)}.preview-controls{display:flex;gap:10px;align-items:center}
      .preview-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:20px}.preview-grid.overview{grid-template-columns:repeat(2,minmax(0,1fr))}
      .preview-card{min-width:0;padding:25px;border:1px solid var(--dsw-alias-border-l1);border-radius:15px;background:var(--dsw-alias-bg-layer-1)}
      .question{padding:0 0 18px;margin:0 0 21px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:15px;line-height:1.8;color:var(--dsw-alias-label-secondary)}
      .demo-markdown{white-space:pre-wrap;line-height:1.85}.demo-markdown .katex-display{margin:1.15em 0}.demo-markdown code{font-size:.92em}
      .preview footer{max-width:1180px;margin:20px auto 0;color:var(--dsw-alias-label-secondary);font-size:12px;display:flex;justify-content:space-between;gap:15px}
      @media(max-width:850px){.preview{padding:22px 16px}.preview header{align-items:flex-start;flex-direction:column}.preview-grid.overview{grid-template-columns:1fr}.preview-card{padding:20px}.preview-controls{flex-wrap:wrap}}
    `}</style>
    <header><div><h1>dsh-intelligent-ui</h1><p>有必要才画图，让答案可以直接操作。</p></div><div className="preview-controls"><nav aria-label="组件示例">
      {[['overview', '交互与数据'], ['architecture', '架构与公式'], ['plan', '流程与清单']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </nav><button className="theme-toggle" onClick={() => setDark(!dark)}>{dark ? '浅色主题' : '深色主题'}</button></div></header>
    <section className={'preview-grid ' + tab}>{samples.map(sample => <article key={sample.id} className="preview-card"><p className="question">{sample.question}</p><div className="diui"><RichAnswer text={sample.source} scopeKey={'public-demo:' + sample.id}/></div></article>)}</section>
    <footer><span>实际 IUI 组件 · 合成示例数据 · 本机交互</span><span>MIT · github.com/cpsGGG/dsh-intelligent-ui</span></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
