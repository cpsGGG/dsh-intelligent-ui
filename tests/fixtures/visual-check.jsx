import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RichAnswer} from '../../plugin/blocks.jsx';
import {ImageCopyLayer} from '../../plugin/copy-controls.jsx';
import {figureToPng,imageToPng} from '../../plugin/clipboard.mjs';
import {standardAttention,linearAttention} from './attention.mjs';
import css from '../../plugin/reader.css';

const source='```iui-compare\n'+JSON.stringify({title:'公式与结构图 · 深浅主题及复制检查',panels:[standardAttention,linearAttention]})+'\n```';
const chart='```iui-chart\n'+JSON.stringify({title:'阅读时长',unit:'分钟',source:'测试数据',values:[{label:'周一',value:25},{label:'周二',value:40},{label:'周三',value:55}]})+'\n```';
const syntheticImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#e9f2ff"/><text x="600" y="300" font-size="48" text-anchor="middle" fill="#244e80">Synthetic image copy fixture · 1200 × 600</text></svg>');
function App(){
  const [dark,setDark]=useState(true),[narrow,setNarrow]=useState(false),[paste,setPaste]=useState(null);
  const showPng=file=>{const reader=new FileReader();reader.onload=()=>{const url=reader.result,image=new Image();image.onload=()=>setPaste({url,width:image.naturalWidth,height:image.naturalHeight,size:file.size});image.src=url;};reader.readAsDataURL(file);};
  const checkExport=async()=>{try{showPng(await figureToPng(document.querySelector('.diui-copy-content').firstElementChild));}catch(error){setPaste({error:error.message});}};
  const checkOriginal=async()=>{try{showPng(await imageToPng(document.querySelector('.qa-source-image')));}catch(error){setPaste({error:error.message});}};
  const onPaste=event=>{
    const file=[...event.clipboardData.items].find(item=>item.type==='image/png')?.getAsFile();if(!file)return;
    event.preventDefault();showPng(file);
  };
  return <div className={'qa '+(dark?'dark':'light')}><style>{css}</style><style>{`
    *{box-sizing:border-box}body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif}.qa{min-height:100vh;padding:24px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
    .qa.dark{--dsw-alias-bg-base:#171819;--dsw-alias-bg-layer-1:#25272a;--dsw-alias-label-primary:#eeeff2;--dsw-alias-label-secondary:#b7bec7;--dsw-alias-border-l1:#373b41;--dsw-alias-brand-primary:#9abaff}
    .qa.light{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f5f7fa;--dsw-alias-label-primary:#202733;--dsw-alias-label-secondary:#596474;--dsw-alias-border-l1:#dbe0e6;--dsw-alias-brand-primary:#245eaf}
    .qa-toolbar{display:flex;gap:8px;justify-content:center;margin-bottom:18px}.qa-toolbar button{padding:7px 12px;font:inherit;border:1px solid #8190a4;border-radius:6px;cursor:pointer}.qa-content{margin:auto;max-width:1160px}.qa-content.narrow{max-width:420px}
    .mock-native-markdown{color:var(--dsw-alias-label-primary);white-space:pre-wrap}.mock-native-markdown .katex{color:var(--dsw-alias-label-primary)}
    .qa-paste{margin:24px 0;border:1px dashed #8190a4;border-radius:8px;padding:16px;min-height:56px}.qa-pasted img{display:block;max-width:100%;border:1px solid #8190a4}.qa-source-image{width:480px;max-width:100%;height:auto;display:block;margin:12px 0 24px}
  `}</style><div className="qa-toolbar"><button onClick={()=>setDark(!dark)}>{dark?'切换浅色':'切换深色'}</button><button onClick={()=>setNarrow(!narrow)}>{narrow?'宽版':'窄版'}</button><button onClick={checkExport}>检查导出图片</button><button onClick={checkOriginal}>检查原图</button></div>
    <main className={'qa-content diui '+(narrow?'narrow':'')}><ImageCopyLayer><RichAnswer text={source}/><RichAnswer text={chart}/><p>原图复制检查：使用 1200 × 600 的合成测试图片。</p><img className="qa-source-image" src={syntheticImage} alt="合成图片复制夹具"/></ImageCopyLayer>
      <div className="qa-paste" role="textbox" aria-label="粘贴检验" contentEditable suppressContentEditableWarning onPaste={onPaste}>点击这里，按 Ctrl+V 检验复制结果</div>
      {paste&&<figure className="qa-pasted"><figcaption>{paste.error||`PNG 结果：${paste.width} × ${paste.height}，${paste.size} 字节`}</figcaption>{paste.url&&<img src={paste.url} alt="PNG 导出或粘贴结果"/>}</figure>}
    </main></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
