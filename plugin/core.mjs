import { MAX_SOURCE_LENGTH } from '../src/answer.mjs';
import { parseBlock, VISUAL_LANGUAGES } from './schema.mjs';

/** Only recognize complete top-level fences. Everything else stays byte-for-byte Markdown. */
export function segmentAnswer(source, { streaming = false } = {}) {
  if (typeof source !== 'string') return [];
  if (source.length > MAX_SOURCE_LENGTH) return [{ type: 'markdown', text: source, start: 0 }];
  const lines = [...source.matchAll(/[^\n]*(?:\n|$)/g)].filter(m => m[0]);
  const segments = [];
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(lines[i][0]);
    if (!match) continue;
    const delimiter = match[2], language = match[3].trim().toLowerCase();
    const endPattern = new RegExp(`^ {0,3}${delimiter[0]}{${delimiter.length},}[ \\t]*\\r?\\n?$`);
    let end = i + 1;
    while (end < lines.length && !endPattern.test(lines[end][0])) end++;
    if (end === lines.length) {
      if (streaming && VISUAL_LANGUAGES.has(language)) {
        const start = lines[i].index;
        if (start > cursor) segments.push({ type: 'markdown', text: source.slice(cursor, start), start: cursor });
        segments.push({ type: 'pending', language, raw: source.slice(start), start });
        cursor = source.length;
      }
      break;
    }
    const start = lines[i].index;
    const finish = lines[end].index + lines[end][0].length;
    if (VISUAL_LANGUAGES.has(language)) {
      if (start > cursor) segments.push({ type: 'markdown', text: source.slice(cursor, start), start: cursor });
      const raw = source.slice(start, finish);
      try {
        const contentStart = start + lines[i][0].length;
        segments.push({ ...parseBlock(language, source.slice(contentStart, lines[end].index)), raw, start });
      } catch (error) {
        segments.push({ type: 'markdown', text: raw, warning: `图形未转换：${error.message}。完整原文已保留。`, start });
      }
      cursor = finish;
    }
    i = end; // Do not interpret examples inside ordinary code fences.
  }
  if (cursor < source.length) segments.push({ type: 'markdown', text: source.slice(cursor), start: cursor });
  return segments;
}

export function textFromBlocks(blocks) {
  return (blocks ?? []).filter(x => x.kind === 'text' && typeof x.text === 'string').map(x => x.text).join('\n\n');
}

/** Read host-owned Chat projections, never private model reasoning or DOM text. */
export function projectAnswers(snapshot) {
  if (!snapshot?.nodes?.get || !Array.isArray(snapshot.order)) return [];
  const answers = [];
  for (const key of snapshot.order) {
    const node = snapshot.nodes.get(key);
    if (node?.kind !== 'assistant-step') continue;
    const data = node.data;
    if (!data || !Array.isArray(data.blocks)) continue;
    const text = textFromBlocks(data.blocks);
    const images = data.blocks.filter(x => x.kind === 'image' && x.attachment).map(x => x.attachment);
    if (!text.trim() && images.length === 0) continue;
    answers.push({ key, text, images, status: data.status, messageId: data.finalNode?.messageId,
      turn: node.location?.turn, finalNode: data.finalNode });
  }
  return answers;
}

export function createStore(initial) {
  let current = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => current,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set(value) { current = value; for (const listener of listeners) listener(); },
  };
}

export function safeLocalImage(base, path) {
  if (typeof path !== 'string' || /[\u0000-\u001f\u007f]/.test(path) || /^[/\\]{2}/.test(path)) return undefined;
  if (!(path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path))) return undefined;
  if (!/^https?:/.test(base) && !base.startsWith('dsh-app://app/')) return undefined;
  return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
}
