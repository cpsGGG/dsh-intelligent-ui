# DSH integration and verification

Current plugin: **0.6.1 Beta**. Primary native verification: **DSH 0.2.1-rc.3 Desktop on Windows**, October 29, 2026. The initial interface audit used DSH 0.2.1-rc.2. This document describes the tested boundary, not a promise that every host release or plugin combination works.

## Host and client responsibilities

- `plugin/host.mjs` adds a named `systemPrompt.section` and registers `intelligent_ui_image_search`. It preserves the deployment's overall persona.
- The presentation rule provider reads the current `agent.session.id` whenever a model request is assembled. `defaultEnabled` and `sessionOverrides` use host-backed volatile settings.
- `plugin/client.jsx` owns the stylesheet, native assistant adapter, conversation switch, sidebar entry, and example panel within Cordis effects.
- `plugin/client-lifecycle.mjs` checks both bundle enablement and the exact runtime component. Disabling or disconnecting removes the interface; re-enabling mounts it once.
- The assistant adapter uses the official keyed `conversation.chat.node` slot for assistant steps. It keeps native reasoning disclosure, content/image factories, authorized file mentions, streaming, and interruption behavior.

The adapter does not own user messages, tools, or the native input box. When the renderer is removed, native rendering resumes and original answer text remains available.

## Conversation preference

The switch is registered in `conversation.input.left`. It uses `configForms.get('dsh-intelligent-ui')` and writes only `sessionOverrides[sessionId]` through the official `set/unset` mutation queue. Unknown session context uses ordinary-answer mode.

Navigation reads an already synchronized snapshot. The shared settings provider handles invalidation and reconnect updates; IUI no longer unconditionally reloads the global settings mirror for each conversation. Initial unanswered settings and explicit retries retain a read path.

When off, subsequent requests receive concise ordinary-Markdown rules. Image calls check the preference before entering the queue and before each request. Already-sent requests are not retracted. Existing visual answers remain rendered while the plugin is enabled.

## Rendering

Only complete, valid, top-level `iui-*` fences become components. Ordinary Markdown remains exact, and invalid structures retain their source. Each component has bounded inputs and a schema; interactive expressions are interpreted by a restricted parser.

DSH supplies production Markdown and math. The display adapter repairs clearly identifiable legacy formula code blocks after streaming finishes, without rewriting the stored answer. Real code and ambiguous formulas remain unchanged.

ELK lays out measured diagram nodes with orthogonal routes. Math labels use native rendering, and columns respond to actual layout width. Complex cycles and dense connections still have readability limits; the model is instructed to simplify or split explanations.

PNG copying uses the original image URL or an offscreen figure clone. It preserves full figure width, fonts, math, arrows, and captions, then writes PNG to the clipboard. External image CORS rules and clipboard permissions still apply.

## Verification before the first public release

- 87 automated checks passed with zero failures and zero skips on Windows / Node.js 24 using the project's declared dependencies.
- Tests use the published DSH SlotCore and Cordis packages, actual React components, jsdom, real ELK layout, and KaTeX syntax validation. CI is configured for Linux and Windows with Node.js 22 and 24.
- Native DSH questions produced an adjustable calculator, a verified-source image gallery, a reading-time chart, flow steps, architecture comparisons, and typeset formulas.
- Native switch tests confirmed per-conversation isolation, ordinary answers when off, and components after enabling again.
- Disabling and re-enabling the bundle removed and restored the native client registrations.
- Native dark-theme formula labels were readable inside colored nodes. Figure copying was verified by pasting into the native composer and opening the resulting image preview.
- Following the 0.6.1 navigation fix, repeated conversation switches retained the selected third-party theme in the tested session.

Private session captures and extracted installation modules are not distributed. The public README captures are synthetic component examples. Browser fixtures model Markdown for isolated rendering checks; they do not substitute for native host verification.

## Compatibility limits

Third-party plugins that override the same assistant, reasoning, image, Markdown, or theme surfaces may need adaptation. The 0.6.1 change removes an IUI-triggered settings reload; separate host/theme-plugin adoption paths remain a compatibility concern and are not declared universally fixed. Experimental fixes to other plugins are outside this release.

Markdown separated by a component is rendered in segments, so reference definitions or footnotes spanning a component may not resolve across those segments. Direct Markdown links avoid this issue.

## Updating

GitHub tags include prebuilt `lib/` files. A normal GitHub installation needs no build hook. Development builds use `npm ci` and `npm run check`; no other local project's dependencies are required.

The client may hot reload, but updating host prompts or tools can leave old modules cached. Finish active work and restart DSH normally if the host requests a restart or the updated behavior is absent. A displayed package version alone is not proof that every host module was reloaded.

See [the host contract](host-contract.md), [image tool contract](image-tool-contract.md), and [contribution guide](../CONTRIBUTING.md).
