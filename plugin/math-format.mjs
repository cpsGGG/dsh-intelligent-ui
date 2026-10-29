/** Display-only normalization. The conversation source is never rewritten. */
const MATH_FENCES = new Set(['', 'text', 'plain', 'plaintext', 'math', 'tex', 'latex']);
const SYMBOLS = Object.freeze({
  'φ':'\\phi ', 'ϕ':'\\varphi ', 'κ':'\\kappa ', 'α':'\\alpha ', 'β':'\\beta ', 'γ':'\\gamma ', 'δ':'\\delta ', 'ε':'\\epsilon ', 'θ':'\\theta ', 'λ':'\\lambda ', 'μ':'\\mu ', 'π':'\\pi ', 'σ':'\\sigma ', 'τ':'\\tau ', 'ω':'\\omega ',
  'Σ':'\\Sigma ', '∑':'\\sum ', 'Π':'\\Pi ', '∏':'\\prod ', '∫':'\\int ', '∞':'\\infty ', '∈':'\\in ', '∉':'\\notin ', 'ℝ':'\\mathbb{R}', 'ℂ':'\\mathbb{C}', 'ℕ':'\\mathbb{N}',
  '×':'\\times ', '·':'\\cdot ', '⋅':'\\cdot ', '→':'\\to ', '⇒':'\\Rightarrow ', '≈':'\\approx ', '≤':'\\le ', '≥':'\\ge ', '≠':'\\ne ', '−':'-',
});
const SOURCE_CONTEXT = /(?:源码|源代码|程序代码|代码示例|代码如下|伪代码|原样输出|不要渲染|LaTeX\s*(?:代码|语法)|source\s+code|literal\s+(?:tex|math))/i;
const MATH_CONTEXT = /(?:公式|方程|等式|表达式|核函数|注意力|推导|数学|定义|展开|化简|复杂度|其中|归一化|计算|formula|equation|attention)/i;
const PROGRAM = /(?:\b(?:const|let|var|return|import|from|function|def|class|print|console|SELECT|INSERT|UPDATE|CREATE|throw|await)\b|=>|===|!==|:=|\+=|-=|\*\*|;|https?:|[A-Za-z]:\\|\.\/(?:\w)|\\(?:documentclass|usepackage|begin\{document\}|newcommand|def|input|include|href|html))/i;

function balanced(source) {
  const stack = [], pairs = { ')':'(', ']':'[', '}':'{' };
  for (const c of source) {
    if ('([{'.includes(c)) stack.push(c);
    if (Object.hasOwn(pairs,c) && stack.pop() !== pairs[c]) return false;
    if (stack.length > 16) return false;
  }
  return stack.length === 0;
}

/** Find separators outside groups. This deliberately is not a programming parser. */
function outerPositions(source, symbol) {
  const result = []; let depth = 0;
  for (let i=0;i<source.length;i++) {
    const c=source[i]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === symbol) result.push(i);
  }
  return result;
}

function renderGroupFractions(source) {
  let output = '';
  for (let i=0;i<source.length;i++) {
    const c=source[i];
    if (c!=='(' && c!=='[') { output+=c; continue; }
    const close = c==='(' ? ')' : ']'; let end=i+1, depth=1;
    for (;end<source.length;end++) { if (source[end]===c) depth++; else if(source[end]===close && --depth===0) break; }
    if (end===source.length) return source;
    output+=c+fraction(source.slice(i+1,end))+close; i=end;
  }
  return output;
}

function fraction(source) {
  const equals=outerPositions(source,'=');
  if (equals.length===1) { const at=equals[0]; return fraction(source.slice(0,at).trim())+' = '+fraction(source.slice(at+1).trim()); }
  const divisions=outerPositions(source,'/');
  if (divisions.length===1) {
    const at=divisions[0], left=source.slice(0,at).trim(),right=source.slice(at+1).trim();
    // A sum/product written on each side of the slash denotes an aggregate
    // quotient. Ambiguous additive/chained divisions keep their original order.
    if (left && right && !outerPositions(left,'+').length && !outerPositions(right,'+').length
      && !outerPositions(left,'-').some(p=>p>0) && !outerPositions(right,'-').some(p=>p>0)) {
      return `\\frac{${renderGroupFractions(left)}}{${renderGroupFractions(right)}}`;
    }
  }
  return renderGroupFractions(source);
}

function rootTerms(source) {
  return source.replace(/√\s*(\([^()]+\)|\{[^{}]+\}|[A-Za-z0-9]+(?:_(?:\{[^{}]+\}|[A-Za-z0-9]+))?)/g, (_match,term) => {
    const body = /^[({]/.test(term) ? term.slice(1,-1) : term;
    return `\\sqrt{${body}}`;
  });
}

/** Convert only recognizable mathematical notation, never arbitrary code. */
export function formulaToTex(source, { contextual = false, explicit = false, notation = false } = {}) {
  if (typeof source!=='string' || source.length>2000 || !source.trim() || PROGRAM.test(source) || !balanced(source)) return null;
  const value=source.trim();
  if ((notation ? /[\p{Script=Han}`";@]/u : /[\p{Script=Han}`"';@]/u).test(value)) return null;
  const tex = /\\(?:frac|sum|prod|sqrt|int|phi|varphi|alpha|beta|sigma|theta|mathbb|mathrm|operatorname|begin|left|right|underbrace|boxed)\b/.test(value);
  const distinctive = /[φϕκΣ∑Π∏∫√ℝℂℕ∈∞ᵀ²³]/u.test(value)
    || /\b(?:exp|softmax|log|sin|cos)\s*\([^)]*[_^·⋅]/.test(value)
    || /[_^].*[=·⋅]/.test(value);
  if (!tex && !distinctive && !(contextual && /[=^_]/.test(value)) && !explicit) return null;
  if (tex) return value; // Already-authored TeX retains exact grouping and macros.
  if (!/^[A-Za-z0-9\sα-ωΑ-Ωϕ∑∏∫√ℝℂℕ∞∈∉×·⋅→⇒≈≤≥≠−ᵀᵗ²³⁻⁰¹⁴⁵⁶⁷⁸⁹=+*/^_.,:|()[\]{}!%'<>-]+$/u.test(value)) return null;
  let result=rootTerms(value).replace(/ᵀ|ᵗ/g,'^{\\mathsf{T}}').replace(/²/g,'^{2}').replace(/³/g,'^{3}')
    .replace(/Σ(?=\s*[_^])/g,'\\sum ').replace(/Π(?=\s*[_^])/g,'\\prod ');
  result=result.replace(/[φϕκ αβγδεθλμπστωΣ∑Π∏∫∞∈∉ℝℂℕ×·⋅→⇒≈≤≥≠−]/g,c=>SYMBOLS[c]??c);
  result=result.replace(/\bR(?=\s*\^)/g,'\\mathbb{R}');
  result=result.replace(/\^T\b/g,'^{\\mathsf{T}}').replace(/([_^])([A-Za-z0-9]+)\b/g,'$1{$2}');
  result=result.replace(/\b(softmax|exp|log|ln|sin|cos|tan|max|min)(?=\s*\()/g,'\\operatorname{$1}');
  return fraction(result).trim();
}

function mathLine(line, context, explicit) {
  let body=line.trim(), label='', note='';
  const prefix=/^([\p{Script=Han}][\p{Script=Han}A-Za-z\s（）()]{0,24}[：:])\s*/u.exec(body);
  if (prefix) { label=prefix[1]; body=body.slice(prefix[0].length); }
  const han=body.search(/\p{Script=Han}/u);
  if (han>=0) {
    note=body.slice(han); body=body.slice(0,han).trim().replace(/\s*[→⇒,:，：]\s*$/u,'');
  }
  const formula=formulaToTex(body,{contextual:MATH_CONTEXT.test(context),explicit});
  if (!formula) return null;
  return [label,`$$\n${formula}\n$$`,note].filter(Boolean).join('\n\n');
}

function inlineFormulas(text) {
  // Preserve multi-backtick samples, escaped backticks, and source-code prose.
  if (SOURCE_CONTEXT.test(text)) return text;
  return text.replace(/(?<![`\\])`([^`\n]+)`(?!`)/g,(raw,body)=> {
    const tex=formulaToTex(body);
    return tex ? `$${tex}$` : raw;
  });
}

export function normalizeMathMarkdown(source, { streaming = false } = {}) {
  if (typeof source!=='string' || streaming || source.length>100000) return { text:source,changed:false };
  const lines=[...source.matchAll(/[^\n]*(?:\n|$)/g)].filter(m=>m[0]);
  let output='',cursor=0;
  for (let i=0;i<lines.length;i++) {
    const open=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(lines[i][0]);
    if (!open) continue;
    const start=lines[i].index,delimiter=open[1],language=open[2].trim().toLowerCase();
    const closing=new RegExp(`^ {0,3}${delimiter[0]}{${delimiter.length},}[ \\t]*\\r?\\n?$`);
    let end=i+1; while(end<lines.length&&!closing.test(lines[end][0])) end++;
    output+=inlineFormulas(source.slice(cursor,start));
    if (end===lines.length) { output+=source.slice(start); cursor=source.length; break; }
    const finish=lines[end].index+lines[end][0].length,raw=source.slice(start,finish);
    const body=source.slice(start+lines[i][0].length,lines[end].index);
    const context=source.slice(Math.max(0,start-220),start);
    const items=body.trim().split(/\r?\n/).filter(line=>line.trim());
    let converted;
    if (MATH_FENCES.has(language) && delimiter.length===3 && body.length<=6000 && items.length<=12
      && !SOURCE_CONTEXT.test(context) && !PROGRAM.test(body)) {
      const explicit=['math','tex','latex'].includes(language);
      const rendered=items.map(line=>mathLine(line,context,explicit));
      if (rendered.length && rendered.every(Boolean)) converted=rendered.join('\n\n')+'\n';
    }
    output+=converted??raw; cursor=finish; i=end;
  }
  output+=inlineFormulas(source.slice(cursor));
  return {text:output,changed:output!==source};
}

export const texText = text => String(text).replace(/[\\{}$%&#_^~]/g, c => ({'\\':'\\textbackslash{}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c] ?? '\\'+c));

/** Render the existing bounded calculator AST; no second expression evaluator. */
export function expressionToTex(ast, labels = {}) {
  if ('number' in ast) return String(ast.number);
  if (ast.variable) return ast.variable==='pi' ? '\\pi' : `\\text{${texText(labels[ast.variable]??ast.variable)}}`;
  if (ast.unary) return `${ast.unary}\\left(${expressionToTex(ast.value,labels)}\\right)`;
  if (ast.call) {
    const args=ast.args.map(value=>expressionToTex(value,labels));
    return ast.call==='sqrt' ? `\\sqrt{${args[0]}}` : `\\operatorname{${ast.call}}\\left(${args.join(', ')}\\right)`;
  }
  const left=expressionToTex(ast.left,labels),right=expressionToTex(ast.right,labels);
  if (ast.op==='/') return `\\frac{${left}}{${right}}`;
  if (ast.op==='^') return `\\left(${left}\\right)^{${right}}`;
  const operation={'*':'\\cdot','%':'\\bmod'}[ast.op]??ast.op;
  return `\\left(${left} ${operation} ${right}\\right)`;
}
