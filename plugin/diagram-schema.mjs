const text = (value, label, maximum = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label}需要 1–${maximum} 字符的文字`);
  return value;
};
const list = (value, label, maximum, minimum = 1) => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${label}需要 ${minimum}–${maximum} 项`);
  return value;
};
const record = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是 JSON 对象`);
  return value;
};
const optionalText = (value, maximum = 1000) => value === undefined || value === '' ? '' : text(value, '说明', maximum);
const TONES = new Set(['blue', 'green', 'orange', 'neutral']);

/** The previous diagram wire format remains valid; omitted direction now means top-to-bottom. */
export function parseDiagram(value) {
  const data = record(value, '结构图');
  const title = text(data.title, '标题', 160);
  const direction = data.direction ?? 'down';
  if (!['down', 'right'].includes(direction)) throw new Error('结构图方向只支持 down 或 right');
  const ids = new Set();
  const nodes = list(data.nodes, '图中节点', 24, 2).map(value => {
    const item = record(value, '节点');
    const id = text(item.id, '节点 ID', 32);
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id) || ids.has(id)) throw new Error('节点 ID 必须唯一且仅含字母、数字、横线');
    const tone = item.tone ?? 'neutral';
    if (!TONES.has(tone)) throw new Error('节点色调只支持 blue、green、orange 或 neutral');
    ids.add(id);
    return { id, label: text(item.label, '节点名称', 80), formula:optionalText(item.formula,600), meta:optionalText(item.meta,160), detail: optionalText(item.detail, 1600), tone };
  });
  const edges = list(data.edges, '连接关系', 48).map(value => {
    const item = record(value, '连接');
    if (!ids.has(item.from) || !ids.has(item.to)) throw new Error('连接引用了不存在的节点');
    return { from: item.from, to: item.to, label: optionalText(item.label, 30) };
  });
  return { type: 'diagram', title, direction, nodes, edges, caption: optionalText(data.caption, 500) };
}

/** Two comparable structures share an orientation; each still owns its nodes and edges. */
export function parseComparison(value) {
  const data = record(value, '结构对比');
  return {
    type: 'compare', title: text(data.title, '标题', 160),
    panels: list(data.panels, '对比面板', 2, 2).map(panel => ({ ...parseDiagram(panel), direction: 'down' })),
    caption: optionalText(data.caption, 500),
  };
}
