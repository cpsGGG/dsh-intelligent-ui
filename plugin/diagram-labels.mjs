import { formulaToTex, texText } from './math-format.mjs';

const SUBS = Object.fromEntries([... '₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'].map((c,i)=>[c,[... '0123456789aehijklmnoprstuvx'][i]]));
const SUB_PATTERN = /[₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/gu;
const notation = text => text.replace(SUB_PATTERN, s=>'_{'+[...s].map(c=>SUBS[c]).join('')+'}').replace(/[′’]/g,"'");
const functions = /\b(?:softmax|Softmax|exp|sqrt|log|ln|sin|cos|tan|max|min|tanh|ReLU|ELU)\b/g;

function inferredFormula(value) {
  const source=notation(value.trim());
  if (!source || /[\p{Script=Han}]/u.test(source)) return null;
  if (/\\[a-zA-Z]+/.test(source)) return source;
  const rest=source.replace(functions,'').replace(/[_^]\{[^}]*\}/g,'').replace(/[_^][A-Za-z0-9]/g,'');
  // Do not turn prose and operation names into a row of italic variables.
  if (/[A-Za-z]{3,}/.test(rest)) return null;
  if (!/[_^=+*/×·⋅φϕΣ∑√ℝ∈<>→∞′'ᵀ²³-]/u.test(source) && !/^[A-Za-z](?:[A-Za-z0-9])?$/.test(source)) return null;
  return formulaToTex(source,{explicit:true,notation:true});
}

/** Legacy node labels are notation, not source code. Convert only identifiable spans. */
export function diagramLabelLine(value) {
  const line=String(value).trim();
  if (/\$|\\[([]/.test(line)) return {markdown:line,math:true,source:line};
  const quotient=/^([^\p{Script=Han}]+)\/\s*([\p{Script=Han}]+)$/u.exec(line);
  if (quotient) {
    const numerator=inferredFormula(quotient[1]) ?? (/^exp\s*$/.test(quotient[1]) ? '\\exp' : null);
    if (numerator) return {markdown:'$\\displaystyle\\frac{'+numerator+'}{\\text{'+texText(quotient[2])+'}}$',math:true,source:line};
  }
  let math=false;
  const markdown=line.split(/([\p{Script=Han}]+)/u).map(part=>{
    if (!part || /[\p{Script=Han}]/u.test(part)) return part;
    const formula=inferredFormula(part);
    if (!formula) return part;
    math=true;
    return (part.match(/^\s*/)?.[0]??'')+'$\\displaystyle '+formula+'$'+(part.match(/\s*$/)?.[0]??'');
  }).join('');
  return {markdown,math,source:line};
}

export function diagramLabelLines(node) {
  const lines=node.label.split(/\r?\n/).filter(Boolean).map(diagramLabelLine);
  if (node.formula) {
    const tex=node.formula.trim().replace(/^\$\$?|\$\$?$/g,'');
    lines.push({markdown:'$\\displaystyle '+tex+'$',math:true,source:tex});
  }
  if (node.meta) lines.push(...node.meta.split(/\r?\n/).filter(Boolean).map(diagramLabelLine));
  return lines;
}
