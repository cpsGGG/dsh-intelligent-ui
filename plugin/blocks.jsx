import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { segmentAnswer, safeLocalImage } from './core.mjs';
import { evaluateExpression } from './expressions.mjs';
import { normalizeMathMarkdown, expressionToTex, texText } from './math-format.mjs';
import { Diagram, CompareDiagram } from './diagram.jsx';
import { CopyFigure } from './copy-controls.jsx';

const LABELS = { code: { copyLabel: '复制代码', copiedLabel: '已复制' }, footnotes: '参考资料' };
const pathImages = { resolve: path => safeLocalImage(document.baseURI, path) };
const format = (value, precision = 2) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: precision }).format(value);
const hash = source => { let value = 2166136261; for (let i = 0; i < source.length; i++) value = Math.imul(value ^ source.charCodeAt(i), 16777619); return (value >>> 0).toString(36); };

function MathMarkdown({ text, streaming=false, ...props }) {
  const normalized = useMemo(() => normalizeMathMarkdown(text,{streaming}),[text,streaming]);
  return <MarkdownText text={normalized.text} streaming={streaming} labels={LABELS} {...props}/>;
}

const diagramText = value => /\$|\\[([]|`/.test(value) ? <MathMarkdown text={value}/> : value;

/** Persist controls only. Never persist the answer, remote media, or a tool result. */
function useSavedState(key, initial, accepts) {
  const [state, setState] = useState(() => {
    try { const raw = localStorage.getItem(key); if (raw && raw.length < 12000) { const parsed = JSON.parse(raw); if (accepts(parsed)) return parsed; } } catch {}
    return initial;
  });
  const update = value => {
    setState(value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };
  return [state, update];
}

function Source({ value }) {
  let url;
  try { const parsed = new URL(value); if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.href; } catch {}
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a> : <>{value}</>;
}

export function Chart({ block, compact = false }) {
  const maximum = Math.max(1, ...block.values.map(item => item.value));
  const valueWidth = Math.max(42, ...block.values.map(item => format(item.value).length * 8));
  return <figure className={`diui-figure${compact ? ' diui-chart-compact' : ''}`} style={{'--diui-chart-value-width':`${valueWidth}px`}}>
    <figcaption>{block.title}<span className="diui-unit">{block.unit}</span></figcaption>
    {block.variant === 'line' ? <div className="diui-line-chart">
      <svg viewBox="0 0 640 240" role="img" aria-label={`${block.title}；${block.values.map(item => `${item.label} ${item.value} ${block.unit}`).join('；')}`}>
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="48" y1={190-i*40} x2="614" y2={190-i*40} className="diui-grid-line"/><text x="39" y={194-i*40} textAnchor="end">{format(maximum*i/4)}</text></g>)}
        <polyline points={block.values.map((item, i) => `${58+i*540/(block.values.length-1)},${190-item.value/maximum*160}`).join(' ')} fill="none" stroke="var(--diui-accent)" strokeWidth="3" strokeLinejoin="round"/>
        {block.values.map((item, i) => <g key={i}><circle cx={58+i*540/(block.values.length-1)} cy={190-item.value/maximum*160} r="4" fill="var(--diui-accent)"><title>{item.label}：{item.value} {block.unit}</title></circle><text x={58+i*540/(block.values.length-1)} y="217" textAnchor="middle">{item.label.slice(0, 8)}</text></g>)}
      </svg>
    </div> : <div className="diui-chart" role="img" aria-label={`${block.title}；${block.values.map(item => `${item.label} ${item.value} ${block.unit}`).join('；')}`}>
      <div className="diui-axis" aria-hidden="true"><span>0</span><span>{format(maximum)} {block.unit}</span></div>
      {block.values.map((item, i) => <div className="diui-bar-row" key={i} aria-hidden="true"><span>{item.label}</span>
        <div className="diui-track"><div className="diui-bar" style={{ width: `${100*item.value/maximum}%` }}/></div><strong>{format(item.value)}</strong></div>)}
    </div>}
    <p className="diui-caption">来源：<Source value={block.source}/></p>
    <details className="diui-data"><summary>查看数据</summary><div className="diui-table-scroll"><table><thead><tr><th>项目</th><th>数值（{block.unit}）</th></tr></thead><tbody>{block.values.map((item, i) => <tr key={i}><td>{item.label}</td><td>{format(item.value, 6)}</td></tr>)}</tbody></table></div></details>
  </figure>;
}

function Flow({ block }) {
  return <figure className="diui-figure"><figcaption>{block.title}</figcaption><ol className="diui-flow">
    {block.steps.map((step, i) => <li key={i}><span className="diui-step-number">{i+1}</span><div><strong>{step.title}</strong>{step.detail && <p>{step.detail}</p>}</div></li>)}
  </ol>{block.caption && <p className="diui-caption">{block.caption}</p>}</figure>;
}

function Interactive({ block, stateKey }) {
  const initial = Object.fromEntries(block.controls.map(control => [control.id, control.value]));
  const accepts = values => values && typeof values === 'object' && block.controls.every(control => {
    const value = values[control.id];
    return typeof value === 'number' && Number.isFinite(value) && (control.type === 'select' ? control.options.some(option => option.value === value) : value >= control.min && value <= control.max);
  });
  const [values, setValues] = useSavedState(stateKey, initial, accepts);
  const id = useId();
  let results = [], dynamicChart, error = '';
  try {
    if (!accepts(values)) throw new Error('请补全输入，并使用允许范围内的数值。');
    results = block.outputs.map(output => ({ ...output, value: evaluateExpression(output.ast, values) }));
    if (block.chart) {
      const items = block.chart.values.map(item => ({ label: item.label, value: evaluateExpression(item.ast, values) }));
      if (items.some(item => item.value < 0)) throw new Error('当前图表只显示非负数值，请调整输入。');
      dynamicChart = { ...block.chart, values: items };
    }
  } catch (cause) { error = cause.message; }
  const change = (control, raw) => {
    const value = raw === '' ? '' : Number(raw);
    setValues({ ...values, [control.id]: value });
  };
  return <section className="diui-interactive" aria-label={block.title}>
    <div className="diui-component-head"><h3>{block.title}</h3><button type="button" className="diui-reset" onClick={() => setValues(initial)}>重置</button></div>
    <div className="diui-control-grid">{block.controls.map(control => <div className="diui-control" key={control.id}>
      <label htmlFor={`${id}-${control.id}`}>{control.label}<span>{control.unit}</span></label>
      {control.type === 'select' ? <select id={`${id}-${control.id}`} value={values[control.id]} onChange={event => change(control, event.target.value)}>{control.options.map((option, i) => <option key={i} value={option.value}>{option.label}</option>)}</select>
        : <div className={control.type === 'range' ? 'diui-range-control' : ''}><input id={`${id}-${control.id}`} type={control.type} min={control.min} max={control.max} step={control.step} value={values[control.id]} onChange={event => change(control, event.target.value)}/>{control.type === 'range' && <output htmlFor={`${id}-${control.id}`}>{format(values[control.id], 4)}</output>}</div>}
    </div>)}</div>
    {error ? <p className="diui-notice" role="status">{error}</p> : <><div className="diui-results" aria-live="polite">{results.map((result, i) => <div key={i}><span>{result.label}</span><output>{format(result.value, result.precision)}<small>{result.unit}</small></output></div>)}</div>{dynamicChart && <CopyFigure><Chart block={dynamicChart} compact/></CopyFigure>}</>}
    {block.note && <p className="diui-caption">{block.note}</p>}
    <details className="diui-data"><summary>计算依据</summary>{block.outputs.map((output, i) => <MathMarkdown key={i} text={`$$\n\\text{${texText(output.label)}} = ${expressionToTex(output.ast,Object.fromEntries(block.controls.map(control=>[control.id,control.label])))}\n$$`}/>)}</details>
  </section>;
}

function GalleryImage({ item }) {
  const [failed, setFailed] = useState(false);
  return <figure className="diui-gallery-item"><a className="diui-photo-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`查看图片来源：${item.title}`}>
    {failed ? <span className="diui-image-failed">图片暂时无法加载 · 查看来源</span> : <img src={item.url} alt={item.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>}
  </a><figcaption><strong>{item.title}</strong>{item.caption && <p>{item.caption}</p>}
    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(item.sourceUrl).hostname}</a>{(item.author || item.license) && <small>{[item.author, item.license].filter(Boolean).join(' · ')}</small>}
  </figcaption></figure>;
}

function Tabs({ block, markdownProps }) {
  const [active, setActive] = useState(0); const id = useId(); const refs = useRef([]);
  const move = event => {
    let next;
    if (event.key === 'ArrowRight') next = (active+1)%block.panels.length;
    if (event.key === 'ArrowLeft') next = (active+block.panels.length-1)%block.panels.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = block.panels.length-1;
    if (next !== undefined) { event.preventDefault(); setActive(next); refs.current[next]?.focus(); }
  };
  return <section className="diui-tabs"><h3>{block.title}</h3><div role="tablist" aria-label={block.title} onKeyDown={move}>{block.panels.map((panel, i) => <button key={i} ref={node => { refs.current[i] = node; }} role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} aria-selected={i===active} tabIndex={i===active ? 0 : -1} onClick={() => setActive(i)}>{panel.label}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel-${active}`} aria-labelledby={`${id}-tab-${active}`} className="diui-tab-body"><MathMarkdown text={block.panels[active].body} {...markdownProps}/></div>
  </section>;
}

function Checklist({ block, stateKey }) {
  const [checked, setChecked] = useSavedState(stateKey, block.items.map(() => false), value => Array.isArray(value) && value.length === block.items.length && value.every(item => typeof item === 'boolean'));
  return <section className="diui-checklist"><div className="diui-component-head"><h3>{block.title}</h3><span className="diui-unit">{checked.filter(Boolean).length} / {checked.length}</span></div>
    {block.items.map((item, i) => <label key={i} className={checked[i] ? 'diui-checked' : ''}><input type="checkbox" checked={checked[i]} onChange={event => setChecked(checked.map((old, index) => index===i ? event.target.checked : old))}/><span>{item.label}{item.detail && <small>{item.detail}</small>}</span></label>)}
  </section>;
}

function Visual({ block, markdownProps, stateKey }) {
  switch (block.type) {
    case 'chart': return <CopyFigure><Chart block={block}/></CopyFigure>;
    case 'flow': return <CopyFigure><Flow block={block}/></CopyFigure>;
    case 'interactive': return <Interactive block={block} stateKey={stateKey}/>;
    case 'gallery': return <section className="diui-gallery"><h3>{block.title}</h3><div className="diui-gallery-grid">{block.images.map((item,i) => <GalleryImage key={i} item={item}/>)}</div></section>;
    case 'diagram': return <CopyFigure><Diagram block={block} renderText={diagramText}/></CopyFigure>;
    case 'compare': return <CopyFigure><CompareDiagram block={block} renderText={diagramText}/></CopyFigure>;
    case 'tabs': return <Tabs block={block} markdownProps={markdownProps}/>;
    case 'checklist': return <Checklist block={block} stateKey={stateKey}/>;
    case 'details': return <details className="diui-details"><summary>{block.title}</summary><div className="diui-details-body"><MathMarkdown text={block.body} {...markdownProps}/></div></details>;
    default: return null;
  }
}

class VisualBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return {failed:true}; }
  render() { return this.state.failed ? <><p className="diui-notice">组件暂时无法显示，原文如下。</p><MarkdownText text={this.props.raw} labels={LABELS}/></> : this.props.children; }
}

export function RichAnswer({ text, streaming=false, fileMentions, scopeKey='preview' }) {
  const blocks = useMemo(() => segmentAnswer(text,{streaming}).map(block => block.type==='markdown' ? {...block,math:normalizeMathMarkdown(block.text,{streaming})} : block),[text,streaming]);
  const [showSource,setShowSource] = useState(false);
  const markdownProps = {fileMentions,pathImages};
  const hasVisual = blocks.some(block => !['markdown','pending'].includes(block.type) || block.math?.changed);
  return <div className="diui-document">
    {showSource ? <pre className="diui-raw" tabIndex={0}>{text}</pre> : blocks.map(block => {
      const componentKey = `${scopeKey}:${block.start}:${block.type==='markdown'||block.type==='pending' ? '' : hash(block.raw)}`;
      const stateKey = `dsh-intelligent-ui:state:${encodeURIComponent(componentKey)}`;
      return <React.Fragment key={componentKey}>{block.warning && <p className="diui-notice" role="status">{block.warning}</p>}
        {block.type==='markdown' ? <MarkdownText text={block.math.text} streaming={streaming} labels={LABELS} {...markdownProps}/>
          : block.type==='pending' ? <div className="diui-pending" role="status"><span/>正在组织可视化内容…</div>
          : <VisualBoundary raw={block.raw}><Visual block={block} markdownProps={markdownProps} stateKey={stateKey}/></VisualBoundary>}
      </React.Fragment>;
    })}
    {hasVisual && !streaming && <div className="diui-source-control"><button type="button" onClick={() => setShowSource(!showSource)}>{showSource ? '返回图文回答' : '查看原文'}</button></div>}
  </div>;
}

export function Attachment({ attachment,loadImage }) {
  const [result,setResult] = useState(null);
  useEffect(() => { let active=true; setResult(null); Promise.resolve().then(() => loadImage(attachment)).then(url => { if(active)setResult({url}); }, () => { if(active)setResult({error:true}); }); return () => {active=false;}; },[attachment,loadImage]);
  if(result?.error) return <p className="diui-notice">图片附件加载失败。</p>;
  if(!result?.url) return <p className="diui-caption">正在加载图片…</p>;
  return <figure className="diui-attachment"><img src={result.url} alt="回答中的图片附件" loading="lazy" onError={() => setResult({error:true})}/></figure>;
}
