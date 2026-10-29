import { parseVisual, safeUrl } from '../src/answer.mjs';
import { compileExpression } from './expressions.mjs';
import { parseDiagram, parseComparison } from './diagram-schema.mjs';

export const VISUAL_LANGUAGES = new Set(['iui-flow', 'iui-chart', 'iui-details', 'iui-interactive', 'iui-gallery', 'iui-diagram', 'iui-compare', 'iui-tabs', 'iui-checklist']);
const text = (value, label, maximum = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label}需要 1–${maximum} 字符的文字`);
  return value;
};
const list = (value, label, maximum, minimum = 1) => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${label}需要 ${minimum}–${maximum} 项`);
  return value;
};
const finite = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error(`${label}需要有限数值`);
  return value;
};
const optionalText = (value, maximum = 1000) => value === undefined || value === '' ? '' : text(value, '说明', maximum);
const url = value => { const result = safeUrl(value); if (!result) throw new Error('图片和来源必须使用有效的 HTTP(S) 地址'); return result; };

export function parseBlock(language, source) {
  if (['iui-flow', 'iui-details'].includes(language)) return parseVisual(language, source);
  const data = JSON.parse(source);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('内容必须是 JSON 对象');
  if (language === 'iui-chart') {
    const block = parseVisual(language, source);
    if (data.variant !== undefined && !['bar', 'line'].includes(data.variant)) throw new Error('图表只支持 bar 或 line');
    return { ...block, variant: data.variant ?? 'bar' };
  }
  const title = text(data.title, '标题', 160);
  if (language === 'iui-gallery') return { type: 'gallery', title, images: list(data.images, '图片', 6).map(item => ({
    url: url(item.url), sourceUrl: url(item.sourceUrl), title: text(item.title, '图片说明', 180),
    caption: optionalText(item.caption, 500), author: optionalText(item.author, 250), license: optionalText(item.license, 150),
  })) };
  if (language === 'iui-tabs') return { type: 'tabs', title, panels: list(data.panels, '选项卡', 6, 2).map(item => ({
    label: text(item.label, '选项名称', 40), body: text(item.body, '内容', 16000),
  })) };
  if (language === 'iui-checklist') return { type: 'checklist', title, items: list(data.items, '清单', 16).map(item => ({
    label: text(typeof item === 'string' ? item : item.label, '清单事项', 250), detail: typeof item === 'string' ? '' : optionalText(item.detail, 500),
  })) };
  if (language === 'iui-diagram') return parseDiagram(data);
  if (language === 'iui-compare') return parseComparison(data);
  if (language === 'iui-interactive') {
    const names = new Set();
    const controls = list(data.controls, '输入控件', 6).map(item => {
      const id = text(item.id, '输入 ID', 24);
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(id) || ['pi', 'e', 'constructor', 'prototype'].includes(id) || names.has(id)) throw new Error('输入 ID 必须是唯一的简单变量名');
      names.add(id);
      if (!['number', 'range', 'select'].includes(item.type)) throw new Error('输入只支持 number、range 或 select');
      const value = finite(item.value, '默认值');
      const control = { id, type: item.type, label: text(item.label, '输入名称', 80), value, unit: optionalText(item.unit, 30) };
      if (item.type === 'select') {
        control.options = list(item.options, '选项', 10, 2).map(option => ({ label: text(option.label, '选项文字', 60), value: finite(option.value, '选项值') }));
        if (!control.options.some(option => option.value === value)) throw new Error('默认值不在选项里');
      } else {
        control.min = finite(item.min ?? 0, '最小值');
        control.max = finite(item.max ?? 1000000, '最大值');
        control.step = finite(item.step ?? 1, '步长');
        if (control.min >= control.max || control.step <= 0 || value < control.min || value > control.max) throw new Error('输入范围、步长或默认值无效');
      }
      return control;
    });
    const expression = value => ({ expr: text(value, '计算式', 600), ast: compileExpression(value, [...names]) });
    const outputs = list(data.outputs, '计算结果', 6).map(item => ({ label: text(item.label, '结果名称', 80), ...expression(item.expr), unit: optionalText(item.unit, 30), precision: Number.isInteger(item.precision) && item.precision >= 0 && item.precision <= 6 ? item.precision : 2 }));
    let chart;
    if (data.chart) chart = { type: 'chart', title: text(data.chart.title, '图表标题', 160), unit: text(data.chart.unit, '图表单位', 40), source: text(data.chart.source, '图表依据', 500), variant: data.chart.variant === 'line' ? 'line' : 'bar',
      values: list(data.chart.values, '图表数据', 16, 2).map(item => ({ label: text(item.label, '数据名称', 80), ...expression(item.expr) })) };
    return { type: 'interactive', title, controls, outputs, chart, note: optionalText(data.note, 1500) };
  }
  throw new Error('不支持的内容格式');
}
