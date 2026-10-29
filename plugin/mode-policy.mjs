/** One host-backed preference contract shared by browser and host. */
export const MAX_SESSION_OVERRIDES = 1000;
export const SESSION_ID_PATTERN = /^(?!(?:__proto__|prototype|constructor)$)[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

export function isSessionId(value) {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

/** Read either a Schemastery volatile field or an ordinary wire snapshot. */
function readField(value, fallback) {
  if (value === undefined) return fallback;
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') return value.get();
  return value;
}

/** Reject malformed or oversized preference maps without trusting inherited keys. */
export function validSessionOverrides(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(value);
  if (keys.length > MAX_SESSION_OVERRIDES) return false;
  return keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return isSessionId(key) && field && 'value' in field && typeof field.value === 'boolean';
  });
}

/**
 * Unknown session context stays in ordinary-answer mode. Known conversations
 * default to enabled; an explicit false override must never be lost to `||`.
 */
export function readMode(config = {}, sessionId) {
  if (!isSessionId(sessionId)) return false;
  try {
    const fallback = readField(config?.defaultEnabled, true);
    const overrides = readField(config?.sessionOverrides, {});
    if (typeof fallback !== 'boolean' || !validSessionOverrides(overrides)) return false;
    return Object.hasOwn(overrides, sessionId) ? overrides[sessionId] : fallback;
  } catch {
    return false;
  }
}

export const ORDINARY_ANSWER_STYLE = `Intelligent UI 当前在本会话中关闭。后续回答使用普通 Markdown：正常段落、列表、表格、代码和公式均可。数学公式用行内 $...$ 或独立的 $$ 公式块，分式、求和与上下标使用正式 TeX，不把数学公式装进代码框；用户明确索要源码时例外。不要输出任何 iui-* 围栏，也不要调用 intelligent_ui_image_search。即使历史回答使用过 iui-* 格式，本轮也遵循此普通回答模式。无需向用户解释该设置，除非用户询问。`;

export const IMAGE_MODE_DISABLED = 'Intelligent UI is disabled for this conversation. Answer with ordinary Markdown and do not call intelligent_ui_image_search.';

/**
 * Keep the existing image-tool queue, but recheck the calling conversation both
 * when a queued call starts and before each request. A toggle cannot retract an
 * already sent request, and does prevent a later queued or pagination request.
 * No Node-only imports: the preference helpers are shared with the browser.
 */
export function createModeGuardedTool(createTool, enabledFor, options = {}) {
  const descriptor = createTool(options);
  let queue = Promise.resolve();
  return {
    ...descriptor,
    execute(args, exec) {
      const sessionId = exec?.agent?.session?.id;
      const check = () => {
        if (!enabledFor(sessionId)) throw new Error(IMAGE_MODE_DISABLED);
        exec?.signal?.throwIfAborted();
        options.signal?.throwIfAborted();
      };
      check();
      const task = queue.then(() => {
        check();
        const fetchImpl = options.fetchImpl ?? globalThis.fetch;
        const scoped = createTool({
          ...options,
          fetchImpl: (...fetchArgs) => {
            check();
            return fetchImpl(...fetchArgs);
          },
        });
        return scoped.execute(args, exec);
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
