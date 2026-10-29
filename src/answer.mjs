/** A conservative, dependency-free answer format. No model calls or invented data. */
export const MAX_SOURCE_LENGTH = 100_000;

export function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function splitLongParagraph(text, limit = 160) {
  if (text.length <= limit) return [text];
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('zh-CN', { granularity: 'sentence' }).segment(text)].map(x => x.segment)
    : text.match(/[^。！？]+[。！？]?/gu) || [text];
  const result = [];
  let pending = '';
  for (const sentence of sentences) {
    if (pending && (pending + sentence).length > limit) { result.push(pending); pending = ''; }
    pending += sentence;
  }
  if (pending) result.push(pending);
  return result;
}

function requiredText(value, name, maximum = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${name}需要有效文字`);
  return value;
}

export function parseVisual(language, source) {
  const data = JSON.parse(source);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('内容必须是 JSON 对象');
  const title = requiredText(data.title, '标题', 160);
  if (language === 'iui-flow') {
    if (!Array.isArray(data.steps) || data.steps.length < 2 || data.steps.length > 8) throw new Error('流程需要 2–8 个步骤');
    return { type: 'flow', title, steps: data.steps.map(step => ({
      title: requiredText(step?.title, '步骤标题', 100),
      detail: typeof step.detail === 'string' ? step.detail.slice(0, 500) : '',
    })), caption: typeof data.caption === 'string' ? data.caption.slice(0, 500) : '' };
  }
  if (language === 'iui-chart') {
    const unit = requiredText(data.unit, '单位', 40);
    const sourceLabel = requiredText(data.source, '数据来源', 500);
    if (!Array.isArray(data.values) || data.values.length < 2 || data.values.length > 16) throw new Error('图表需要 2–16 项数据');
    const values = data.values.map(item => {
      if (typeof item?.value !== 'number' || !Number.isFinite(item.value) || item.value < 0) throw new Error('此柱状图只支持有限的非负数值');
      return { label: requiredText(item.label, '数据名称', 100), value: item.value };
    });
    return { type: 'chart', title, unit, source: sourceLabel, values };
  }
  if (language === 'iui-details') return { type: 'details', title, body: requiredText(data.body, '详细内容', 20000) };
  throw new Error('不支持的内容格式');
}

const isTableRule = line => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const tableCells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, '|'));
const isList = line => /^\s*(?:[-*+] |\d+[.)、] )/.test(line);

/** Parse the supported subset; unsupported code and malformed visual blocks stay visible. */
export function parseAnswer(source) {
  if (typeof source !== 'string') throw new TypeError('回答必须是文字');
  if (source.length > MAX_SOURCE_LENGTH) throw new RangeError('这份回答超过 100,000 字符，请分段粘贴');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let headingCount = 0;
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*(`{3,}|~{3,})([^\s]*)\s*$/);
    if (fence) {
      const language = fence[2].toLowerCase();
      const start = i++;
      const content = [];
      const closing = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (i < lines.length && !closing.test(lines[i])) content.push(lines[i++]);
      const complete = i < lines.length;
      if (complete) i++;
      const text = content.join('\n');
      if (language.startsWith('iui-') && complete) {
        try { blocks.push({ ...parseVisual(language, text), sourceLine: start + 1 }); }
        catch (error) { blocks.push({ type: 'code', language, text, warning: `未转换：${error.message}。原始内容保留如下。` }); }
      } else blocks.push({ type: 'code', language, text, warning: language.startsWith('iui-') ? '内容尚未完整，保留原文。' : '' });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { blocks.push({ type: 'heading', level: Math.max(2, heading[1].length), text: heading[2], id: `answer-section-${++headingCount}` }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const quotes = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quotes.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: quotes.join('\n') }); continue;
    }
    if (i + 1 < lines.length && line.includes('|') && isTableRule(lines[i + 1])) {
      const tableStart = i;
      const headers = tableCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(tableCells(lines[i++]));
      const valid = rows.every(row => row.length === headers.length);
      if (valid) blocks.push({ type: 'table', headers, rows });
      else blocks.push({ type: 'code', language: 'table', text: lines.slice(tableStart, i).join('\n'), warning: '表格列数不一致，保留文本以免遗漏数据。' });
      continue;
    }
    if (isList(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && isList(lines[i]) && /^\s*\d/.test(lines[i]) === ordered) items.push(lines[i++].replace(/^\s*(?:[-*+] |\d+[.)、] )/, ''));
      blocks.push({ type: 'list', ordered, items }); continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: 'divider' }); i++; continue; }
    const image = line.trim().match(/^!\[([^\]]*)\]\(([^\s)]+)\)$/);
    if (image && safeUrl(image[2])) { blocks.push({ type: 'image', alt: image[1] || '原文图片', url: safeUrl(image[2]) }); i++; continue; }
    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|\s*>|\s*`{3,}|\s*~{3,}|!\[)/.test(lines[i]) && !isList(lines[i]) && !(i + 1 < lines.length && isTableRule(lines[i + 1]))) paragraph.push(lines[i++]);
    blocks.push(...splitLongParagraph(paragraph.join('\n')).map(text => ({ type: 'paragraph', text })));
  }
  return blocks;
}
