import { MAX_SOURCE_LENGTH, parseAnswer } from './src/answer.mjs';
import { element, renderAnswer } from './src/view.mjs';
import { samples } from './src/samples.mjs';

const $ = id => document.getElementById(id);
let source = samples[0].source;
let mode = 'rich';
let compare = false;
let toastTimer;

function notify(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
}

function updateLayout() {
  $('rich-tab').classList.toggle('active', mode === 'rich');
  $('raw-tab').classList.toggle('active', mode === 'raw');
  $('rich-tab').setAttribute('aria-pressed', String(mode === 'rich'));
  $('raw-tab').setAttribute('aria-pressed', String(mode === 'raw'));
  $('compare-toggle').setAttribute('aria-pressed', String(compare));
  $('compare-toggle').hidden = mode === 'raw';
  $('original-panel').hidden = mode !== 'raw' && !compare;
  $('answer-panel').hidden = mode === 'raw';
  $('outline-panel').hidden = mode === 'raw' || compare;
  $('reading-layout').classList.toggle('is-comparing', compare && mode === 'rich');
  $('reading-layout').classList.toggle('is-raw', mode === 'raw');
}

function showSource(nextSource) {
  const blocks = parseAnswer(nextSource);
  renderAnswer($('answer'), blocks);
  source = nextSource;
  $('original-text').textContent = source;
  $('source-input').value = source;
  $('outline').replaceChildren();
  for (const block of blocks.filter(x => x.type === 'heading')) {
    const link = element('a', '', block.text.replace(/\*\*/g, '')); link.href = `#${block.id}`; $('outline').append(link);
  }
  if (!$('outline').children.length) $('outline').append(element('p', 'outline-empty', '原文没有章节标题。'));
  updateLayout();
}

function selectSample(sample) {
  $('question-text').textContent = sample.question;
  $('sample-label').textContent = '示例回答';
  $('render-note').textContent = '示例中的结构已预先编写；当前原型不使用模型推理或网页搜索。';
  for (const button of $('examples').children) button.setAttribute('aria-pressed', String(button.dataset.id === sample.id));
  $('input-error').textContent = ''; showSource(sample.source);
}

for (const sample of samples) {
  const button = element('button', 'example-button'); button.dataset.id = sample.id;
  button.append(element('span', '', sample.label), element('small', '', sample.kind));
  button.addEventListener('click', () => selectSample(sample)); $('examples').append(button);
}

$('rich-tab').addEventListener('click', () => { mode = 'rich'; updateLayout(); });
$('raw-tab').addEventListener('click', () => { mode = 'raw'; updateLayout(); });
$('compare-toggle').addEventListener('click', () => { compare = !compare; updateLayout(); });
$('font-toggle').addEventListener('click', () => {
  const large = document.body.classList.toggle('large-type');
  $('font-toggle').setAttribute('aria-pressed', String(large));
  $('font-toggle').title = large ? '恢复标准阅读字号' : '切换为更大的阅读字号';
  notify(large ? '已切换为大字号' : '已恢复标准字号');
});
$('open-editor').addEventListener('click', () => { $('editor-region').hidden = false; $('source-input').focus(); });
$('close-editor').addEventListener('click', () => { $('editor-region').hidden = true; $('open-editor').focus(); });
$('render-button').addEventListener('click', () => {
  const value = $('source-input').value;
  if (!value.trim()) { $('input-error').textContent = '先粘贴一段回答，再整理。'; $('source-input').focus(); return; }
  if (value.length > MAX_SOURCE_LENGTH) { $('input-error').textContent = '回答超过 100,000 字符，请分成几段。'; return; }
  try {
    showSource(value); mode = 'rich'; updateLayout();
    $('input-error').textContent = ''; $('question-text').textContent = '我粘贴的回答'; $('sample-label').textContent = '本地文本';
    $('render-note').textContent = '按原文格式呈现并拆分长段落；未自动生成总结、图表数据或图片。';
    for (const button of $('examples').children) button.setAttribute('aria-pressed', 'false');
    notify('阅读视图已更新，原文已保留');
  } catch (error) { $('input-error').textContent = error.message; }
});
$('copy-button').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(source); notify('原文已复制'); }
  catch { mode = 'raw'; updateLayout(); notify('无法自动复制，可在原始文本中选择复制'); }
});
selectSample(samples[0]);
