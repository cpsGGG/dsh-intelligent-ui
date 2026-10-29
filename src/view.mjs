import { parseAnswer, safeUrl } from './answer.mjs';

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Model text is always text, never innerHTML. */
export function inline(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    if (match[1]) fragment.append(element('strong', '', match[1]));
    else if (match[2]) fragment.append(element('code', 'inline-code', match[2]));
    else {
      const url = safeUrl(match[4]);
      if (url) {
        const link = element('a', '', match[3]);
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; fragment.append(link);
      } else fragment.append(document.createTextNode(match[0]));
    }
    offset = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(offset)));
  return fragment;
}

function table(headers, rows) {
  const wrapper = element('div', 'table-wrap');
  wrapper.tabIndex = 0; wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', `数据表：${headers.join('、')}`);
  const node = element('table');
  const head = element('thead'); const tr = element('tr');
  for (const header of headers) { const th = element('th'); th.scope = 'col'; th.append(inline(header)); tr.append(th); }
  head.append(tr); node.append(head);
  const body = element('tbody');
  for (const row of rows) { const tr = element('tr'); for (const cell of row) { const td = element('td'); td.append(inline(cell)); tr.append(td); } body.append(tr); }
  node.append(body); wrapper.append(node); return wrapper;
}

function flow(block) {
  const figure = element('figure', 'visual-block flow-figure');
  figure.append(element('figcaption', 'visual-title', block.title));
  const steps = element('ol', 'flow-steps');
  block.steps.forEach((step, index) => {
    const li = element('li', 'flow-step');
    li.append(element('span', 'step-index', String(index + 1)));
    const body = element('div', 'step-body'); body.append(element('strong', '', step.title));
    if (step.detail) body.append(element('span', '', step.detail));
    li.append(body); steps.append(li);
  });
  figure.append(steps);
  if (block.caption) figure.append(element('p', 'visual-caption', block.caption));
  return figure;
}

function chart(block) {
  const figure = element('figure', 'visual-block chart-figure');
  figure.append(element('figcaption', 'visual-title', block.title));
  const maximum = Math.max(...block.values.map(item => item.value), 1);
  const chart = element('div', 'bar-chart'); chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', `${block.title}；单位：${block.unit}；${block.values.map(x => `${x.label} ${x.value}`).join('，')}；数据来源：${block.source}`);
  const axis = element('div', 'chart-axis'); axis.setAttribute('aria-hidden', 'true');
  axis.append(element('span', '', '0'), element('span', '', `${maximum} ${block.unit}`)); chart.append(axis);
  for (const [index, item] of block.values.entries()) {
    const row = element('div', 'bar-row'); row.setAttribute('aria-hidden', 'true');
    const track = element('div', 'bar-track');
    const bar = element('span', `bar-fill bar-color-${index % 3}`); bar.style.width = `${item.value / maximum * 100}%`; track.append(bar);
    row.append(element('span', 'bar-label', item.label), track, element('span', 'bar-value', `${item.value} ${block.unit}`)); chart.append(row);
  }
  figure.append(chart, element('p', 'visual-caption', `数据来源：${block.source}。横轴从 0 起。`));
  const details = element('details', 'data-disclosure'); details.append(element('summary', '', '查看原始数据'), table(['项目', `数值（${block.unit}）`], block.values.map(x => [x.label, String(x.value)])));
  figure.append(details); return figure;
}

export function renderAnswer(container, blocks, { nested = false } = {}) {
  const fragment = document.createDocumentFragment();
  for (const block of blocks) {
    let node;
    switch (block.type) {
      case 'heading': node = element(`h${block.level}`); if (!nested) node.id = block.id; node.append(inline(block.text)); break;
      case 'paragraph': node = element('p'); node.append(inline(block.text)); break;
      case 'quote': node = element('blockquote', 'answer-highlight'); node.append(inline(block.text)); break;
      case 'list': node = element(block.ordered ? 'ol' : 'ul', 'answer-list'); for (const item of block.items) { const li = element('li'); li.append(inline(item)); node.append(li); } break;
      case 'table': node = table(block.headers, block.rows); break;
      case 'flow': node = flow(block); break;
      case 'chart': node = chart(block); break;
      case 'details': {
        node = element('details', 'answer-details'); node.append(element('summary', '', block.title));
        const body = element('div', 'details-body');
        if (!nested) renderAnswer(body, parseAnswer(block.body), { nested: true }); else body.textContent = block.body;
        node.append(body); break;
      }
      case 'image': {
        node = element('figure', 'image-figure');
        const button = element('button', 'load-image-button', `加载原文图片：${block.alt}`);
        const source = element('a', 'image-source', `图片地址 · ${new URL(block.url).hostname}`); source.href = block.url; source.target = '_blank'; source.rel = 'noopener noreferrer';
        button.addEventListener('click', () => {
          const image = element('img'); image.alt = block.alt; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => image.replaceWith(element('p', 'format-warning', '图片未能加载，可以打开图片地址查看。')), { once: true });
          image.src = block.url; button.replaceWith(image);
        }, { once: true });
        node.append(button, source); break;
      }
      case 'divider': node = element('hr'); break;
      default: {
        node = element('div', 'code-block');
        if (block.warning) node.append(element('p', 'format-warning', block.warning));
        if (block.language) node.append(element('div', 'code-language', block.language));
        const pre = element('pre'); pre.append(element('code', '', block.text)); node.append(pre);
      }
    }
    fragment.append(node);
  }
  container.replaceChildren(fragment);
}
