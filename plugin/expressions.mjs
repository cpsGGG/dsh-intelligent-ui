/** Small arithmetic interpreter. It never evaluates JavaScript or accesses properties. */
const FUNCTIONS = Object.freeze({
  min: (...args) => Math.min(...args), max: (...args) => Math.max(...args),
  abs: Math.abs, sqrt: Math.sqrt, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, log: Math.log, exp: Math.exp,
});
const UNARY = new Set(['abs', 'sqrt', 'round', 'floor', 'ceil', 'sin', 'cos', 'log', 'exp']);
const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const PRECEDENCE = Object.freeze({ '+': 10, '-': 10, '*': 20, '/': 20, '%': 20, '^': 30 });

export function compileExpression(source, allowedVariables = []) {
  if (typeof source !== 'string' || !source.trim() || source.length > 600) throw new Error('计算表达式需要 1–600 个字符');
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?|([A-Za-z][A-Za-z0-9_]*)|([+*/^%(),-]))/gy;
  let position = 0;
  while (position < source.length) {
    if (!source.slice(position).trim()) break;
    re.lastIndex = position;
    const match = re.exec(source);
    if (!match) throw new Error('计算表达式包含不支持的语法');
    const token = match[1] !== undefined ? Number(match[1] + (match[2] === undefined ? '' : `e${match[2]}`)) : (match[3] ?? match[4]);
    if (typeof token === 'number' && !Number.isFinite(token)) throw new Error('表达式数值过大');
    tokens.push(token); position = re.lastIndex;
    if (tokens.length > 180) throw new Error('计算表达式过长');
  }
  let cursor = 0;
  const allowed = new Set(allowedVariables);
  function parse(minimum = 0, depth = 0) {
    if (depth > 24) throw new Error('计算表达式嵌套过深');
    const token = tokens[cursor++];
    let left;
    if (typeof token === 'number') left = { number: token };
    else if (token === '+' || token === '-') left = { unary: token, value: parse(25, depth + 1) };
    else if (token === '(') { left = parse(0, depth + 1); if (tokens[cursor++] !== ')') throw new Error('括号未闭合'); }
    else if (typeof token === 'string' && /^[A-Za-z]/.test(token)) {
      if (tokens[cursor] === '(') {
        if (!has(FUNCTIONS, token)) throw new Error(`不支持的函数：${token}`);
        cursor++; const args = [];
        do { args.push(parse(0, depth + 1)); if (args.length > 16) throw new Error('函数参数过多'); } while (tokens[cursor] === ',' && ++cursor);
        if (tokens[cursor++] !== ')' || (UNARY.has(token) && args.length !== 1)) throw new Error('函数参数错误');
        left = { call: token, args };
      } else {
        if (!allowed.has(token) && !has(CONSTANTS, token)) throw new Error(`未定义的输入：${token}`);
        left = { variable: token };
      }
    } else throw new Error('计算表达式不完整');
    while (cursor < tokens.length) {
      const op = tokens[cursor];
      const precedence = has(PRECEDENCE, op) ? PRECEDENCE[op] : undefined;
      if (precedence === undefined || precedence < minimum) break;
      cursor++;
      left = { op, left, right: parse(precedence + (op === '^' ? 0 : 1), depth + 1) };
    }
    return left;
  }
  const ast = parse();
  if (cursor !== tokens.length) throw new Error('计算表达式含多余内容');
  return ast;
}

export function evaluateExpression(ast, variables) {
  const visit = node => {
    let result;
    if ('number' in node) result = node.number;
    else if (node.variable) result = has(variables, node.variable) ? variables[node.variable] : CONSTANTS[node.variable];
    else if (node.unary) result = (node.unary === '-' ? -1 : 1) * visit(node.value);
    else if (node.call) result = FUNCTIONS[node.call](...node.args.map(visit));
    else {
      const a = visit(node.left), b = visit(node.right);
      switch (node.op) {
        case '+': result = a + b; break;
        case '-': result = a - b; break;
        case '*': result = a * b; break;
        case '/': if (b === 0) throw new Error('除数不能为 0'); result = a / b; break;
        case '%': if (b === 0) throw new Error('除数不能为 0'); result = a % b; break;
        case '^': result = a ** b; break;
        default: throw new Error('不支持的计算');
      }
    }
    if (typeof result !== 'number' || !Number.isFinite(result) || Math.abs(result) > 1e15) throw new Error('输入超出可计算范围');
    return result;
  };
  return visit(ast);
}
