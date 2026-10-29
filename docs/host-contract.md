# DSH host contract

Interfaces were initially audited on DSH 0.2.1-rc.2 and exercised in a native DSH 0.2.1-rc.3 Desktop installation. Public npm packages supply the standalone test dependencies; private extracted application sources are not required to run this project's tests.

## System prompt section

```js
export const name = 'dsh-intelligent-ui';
export const inject = ['systemPrompt', 'tools'];

export function apply(ctx) {
  ctx.systemPrompt.section({
    name: 'dsh-intelligent-ui:answer-style',
    order: 10150,
    interpolate: false,
    text: context => /* return rules for context.agent.session.id */ '',
  });
}
```

The section has a unique name and is removed with the owning Cordis context. `interpolate: false` preserves literal component JSON. The actual provider reads host-backed per-session settings and chooses full component rules or ordinary-answer rules for the next request.

## Tool registration

The image tool has an explicit JSON Schema, runtime argument validation, an output schema, and an `output.render` that returns text content blocks. It registers through `ctx.tools.register`. Its lifetime aborts pending fetches when the plugin is disabled.

See [image-tool-contract.md](image-tool-contract.md) and `tests/image-search.test.mjs`.

## Client surfaces

| Surface | Use |
| --- | --- |
| `conversation.input.left` | Add one per-session switch without replacing the composer |
| `conversation.chat.node`, key `assistant-step` | Adapt assistant answers while preserving native content behavior |
| Native content/image factories | Keep authorized image loading and reasoning presentation |
| `sidebar.panellist` / `main` | Register the component example panel |
| `configForms` | Read and mutate this plugin's host-backed settings |

Native slot behavior is checked against the published `@deepseek-ai/dsh-client-ui-slots` package. Lifecycle tests use the published Cordis context. Runtime Markdown primitives remain provided by DSH, not bundled into IUI.

## Packaging and installation

`package.json` declares the bundle patch, client entry, inject dependencies, and supported `engines.dsh` range. The patch inserts one plugin row:

```yaml
- insert:
    - id: dsh-intelligent-ui
      name: dsh-intelligent-ui
```

The package name and row module name match. GitHub tags include both `lib/index.js` and `lib/client.js`, so installation does not depend on executing a build hook.

```sh
dsh plugin --profile desktop add "github:cpsGGG/dsh-intelligent-ui#v0.6.1"
dsh plugin --profile desktop remove dsh-intelligent-ui
```

For development, build first and install a local source with `link:/absolute/path/to/dsh-intelligent-ui`. Select the profile actually used by the running app and the CLI shipped with the same desktop distribution. See the [official DSH packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md).

## Reload boundary

The host can reconcile bundle enablement and client registrations. Already-loaded host code may remain cached after a source update; enabling/disabling is not a guaranteed module-cache reset. Finish active tasks and restart normally when necessary. The plugin does not patch the DSH installation.
