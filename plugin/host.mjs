import answerStyle from './answer-style.md';
import z from '@deepseek-ai/schemastery';
import { createImageSearchTool } from './image-search.mjs';
import { readMode, SESSION_ID_PATTERN, ORDINARY_ANSWER_STYLE, createModeGuardedTool } from './mode-policy.mjs';

export const name = 'dsh-intelligent-ui';
export const inject = ['systemPrompt', 'tools'];
export const Config = z.object({
  defaultEnabled: z.boolean().default(true).volatile(),
  sessionOverrides: z.dict(z.boolean(), z.string().pattern(SESSION_ID_PATTERN)).default({}).volatile(),
});

export function apply(ctx, config = {}) {
  const lifetime = new AbortController();
  const enabledFor = sessionId => readMode(config, sessionId);
  ctx.effect(() => () => lifetime.abort(new Error('dsh-intelligent-ui disabled')), 'dsh-intelligent-ui: image requests');
  // Both registries already own their Cordis effect disposers.
  ctx.systemPrompt.section({
    name: 'dsh-intelligent-ui:answer-style', order: 10150,
    interpolate: false,
    text: context => enabledFor(context?.agent?.session?.id) ? answerStyle : ORDINARY_ANSWER_STYLE,
  });
  ctx.tools.register(createModeGuardedTool(createImageSearchTool, enabledFor, { signal: lifetime.signal }));
}
