import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { normalizeMathMarkdown, formulaToTex, expressionToTex } from '../plugin/math-format.mjs';
import { compileExpression } from '../plugin/expressions.mjs';

const fence = body => '```\n'+body+'\n```\n';
const screenshotFormulas = [
  'k(q, k) = φ(q)^T φ(k)',
  'o_i = Σ_j φ(q_i)^Tφ(k_j) v_j / Σ_j φ(q_i)^Tφ(k_j)',
  'o_i = φ(q_i)^T [ Σ_j φ(k_j) v_j^T ] / φ(q_i)^T [ Σ_j φ(k_j) ]',
  'o_i = Σ_j [ exp(q_i·k_j/√d) / Σ_l exp(q_i·k_l/√d) ] · v_j',
  'exp(QK^T) V',
];

test('the reported attention equations become TeX sums, fractions and transposes', () => {
  for(const body of screenshotFormulas) {
    const source='定义核函数：\n\n'+fence(body), normalized=normalizeMathMarkdown(source);
    assert.equal(normalized.changed,true); assert.doesNotMatch(normalized.text,/```/);
    assert.match(normalized.text,/\$\$\n/);
  }
  const quotient=formulaToTex(screenshotFormulas[1]);
  assert.match(quotient,/\\frac\{\\sum/); assert.match(quotient,/\\mathsf\{T\}/);
  const softmax=formulaToTex(screenshotFormulas[3]);
  assert.match(softmax,/\\sqrt\{d\}/); assert.match(softmax,/\\operatorname\{exp\}/);
  assert.match(formulaToTex('Σ = X^T X / n'),/\\Sigma/,'a covariance matrix is not a summation');
});

test('labels and explanations around old equations remain readable and in order', () => {
  const normalized=normalizeMathMarkdown('线性注意力：\n'+fence('标准： o_i = Σ_j softmax(q_iᵀk_j / √d) v_j → 必须构造 n×n\n线性： o_i = Σ_j φ(q_i)ᵀφ(k_j) v_j → 可以交换求和顺序'));
  assert.equal(normalized.changed,true);
  for(const text of ['标准：','必须构造 n×n','线性：','可以交换求和顺序']) assert.ok(normalized.text.includes(text));
  assert.match(normalized.text,/\\frac/);
  const tail=normalizeMathMarkdown('定义核函数：\n'+fence('k(q, k) = φ(q)^T φ(k)      其中 φ: R^d → R^m, 逐 token 的非线性映射'));
  assert.ok(tail.text.includes('其中 φ: R^d → R^m, 逐 token 的非线性映射'));
});

test('real code, programming languages, code examples and ambiguous snippets stay byte-exact', () => {
  const cases=[
    '```python\nphi = q.T @ k\n```',
    '```js\nconst x = a / b;\n```',
    '程序代码示例：\n'+fence('φ = x^2'),
    '```html\n<script>alert(1)</script>\n```',
    fence('const φ = x;'), fence('x = 1'),
    '源码如下：\n```latex\n\\frac{a}{b}\n```',
    '````markdown\n```math\n\\frac{a}{b}\n```\n````',
    '文件 `some_path.py`，变量 `q_i`，命令 `npm run dev`。',
    '```\nΣ_j x_j\nprint(x)\n```',
  ];
  for (const source of cases) assert.deepEqual(normalizeMathMarkdown(source),{text:source,changed:false},source);
});

test('proper TeX is not regrouped and inline formula snippets lose only their code wrapper', () => {
  const original='前文 $a+b/c$。\n\n$$\n\\frac{a+b}{c}\n$$\n';
  assert.deepEqual(normalizeMathMarkdown(original),{text:original,changed:false});
  assert.equal(formulaToTex('\\frac{a+b}{c}'),'\\frac{a+b}{c}');
  const inline=normalizeMathMarkdown('问题在于 `exp(q_i·k_j)` 这一核。');
  assert.match(inline.text,/\$\\operatorname\{exp\}/); assert.doesNotMatch(inline.text,/`/);
  assert.equal(formulaToTex('x = a+b/c',{contextual:true}),'x = a+b/c');
});

test('streaming, incomplete, deeply nested and oversized input remain unchanged', () => {
  const complete='公式：\n'+fence(screenshotFormulas[1]);
  assert.deepEqual(normalizeMathMarkdown(complete,{streaming:true}),{text:complete,changed:false});
  const incomplete='公式：\n```\no_i = Σ_j';
  assert.deepEqual(normalizeMathMarkdown(incomplete),{text:incomplete,changed:false});
  assert.equal(formulaToTex('('.repeat(17)+'Σ_j x_j'+')'.repeat(17)),null);
  assert.equal(formulaToTex('x'.repeat(2001)),null);
});

test('calculator basis uses its existing AST with human labels and mathematical notation', () => {
  const ast=compileExpression('total/people',['total','people']);
  assert.equal(expressionToTex(ast,{total:'总金额',people:'人数'}),'\\frac{\\text{总金额}}{\\text{人数}}');
  assert.match(expressionToTex(compileExpression('sqrt(total)^2',['total'])),/\\sqrt/);
});

const require=createRequire(import.meta.url);
let katex;
try {
  const base=process.env.DSH_BUILD_DEPS;
  const fromPrimitives=base ? createRequire(join(base,'@deepseek-ai/dsh-client-ui-primitives/package.json')) : require;
  katex=fromPrimitives('katex');
} catch(error) { if(error.code!=='MODULE_NOT_FOUND') throw error; }
if (!katex) {
  try { katex=require('katex'); }
  catch(error) { if(error.code!=='MODULE_NOT_FOUND') throw error; }
}
if (!katex) {
  try { katex=require('../.runtime/math-test-deps/node_modules/katex'); }
  catch(error) { if(error.code!=='MODULE_NOT_FOUND') throw error; }
}
test('normalized screenshot formulas are accepted by real KaTeX without error fallback', {skip:katex?false:'Requires the KaTeX development dependency'}, () => {
  for(const formula of screenshotFormulas) {
    const markup=katex.renderToString(formulaToTex(formula),{displayMode:true,throwOnError:true,trust:false});
    assert.match(markup,/katex-html/); assert.doesNotMatch(markup,/katex-error/);
  }
});
