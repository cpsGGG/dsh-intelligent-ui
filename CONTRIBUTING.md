# Contributing

Thank you for helping make DSH answers easier to read and use.

## Run the project

Use Node.js 22.12+ or 24, npm, and Git. No other local project is required.

```sh
git clone https://github.com/cpsGGG/dsh-intelligent-ui.git
cd dsh-intelligent-ui
npm ci
npm run check
```

`npm test` requires all declared development dependencies and rejects skipped tests. CI builds and tests on Linux and Windows with Node.js 22 and 24. Browser/DOM tests use the actual React components and the published DSH SlotCore; they are not substitutes for checking behavior inside DSH.

## Preview components

```sh
npm run demo
```

Open <http://127.0.0.1:4173/assets/readme/demo.html>. This renders the same IUI components with a small demonstration Markdown adapter; DSH itself supplies the production Markdown and math renderer. The demo does not subscribe to live conversations.

## Test inside DSH

```sh
npm run build
dsh plugin --profile desktop add "link:/absolute/path/to/dsh-intelligent-ui"
```

Replace the path and profile with your environment. Use the CLI bundled with your desktop distribution if its version differs from your global CLI. After changing host prompts or tools, finish any active tasks and restart DSH normally to ensure the new module is loaded. Client-only updates may hot reload.

## What to include in a change

- Explain the user-visible problem and the resulting behavior.
- Add a regression check for substantive parsing, state, layout, or lifecycle fixes. Preserve native Markdown and the original answer on unsupported output.
- Run `npm run check`. If the renderer changed, inspect light/dark and narrow layouts, plus the relevant native DSH interaction.
- Include regenerated `lib/` files. Tagged GitHub installs depend on these files; no installation lifecycle script builds them for the user.
- Update both README languages and the changelog when behavior changes.
- Preserve the licenses of bundled dependencies. Use synthetic examples in public screenshots and fixtures.

Please keep each pull request focused. New visual components should solve a concrete reading or interaction problem and include a bounded schema, failure behavior, and model-facing examples.

## Report a problem

Use the [bug report form](https://github.com/cpsGGG/dsh-intelligent-ui/issues/new?template=bug_report.yml). Include plugin/DSH/model versions, a minimal question, expected behavior, and what happened. Remove private conversation content, credentials, and local file paths before posting.

For a potentially sensitive security report, follow [SECURITY.md](SECURITY.md).

Contributions are made under the project's [MIT license](LICENSE); bundled third-party code retains its own license.
