# Changelog

## 0.6.1 — 2026-10-29

First public MIT release. The installable `lib/` files are included in Git so users can install from a tagged GitHub source without a build step.

- Add a visible, persistent Intelligent UI switch beside the native conversation input controls. Each conversation keeps its own preference.
- Render charts, flowcharts, architecture comparisons, interactive calculators, galleries, tabs, checklists, and details inside assistant replies.
- Lay out architecture diagrams with ELK, orthogonal edges, measured labels, and native mathematical notation.
- Preserve native DSH Markdown, reasoning disclosure, attachments, file authorization, streaming, and original answer text.
- Search public Wikimedia Commons image metadata with source, author, and license attribution.
- Copy displayed images or complete IUI figures as PNG, including offscreen diagram width.
- Improve formula contrast inside colored nodes in dark themes.
- Avoid unnecessary global settings reloads on conversation navigation, which could trigger theme adoption in the host.
- Declare reproducible development dependencies, require zero skipped tests, and add Linux/Windows CI.

Validation before publication: 87 automated checks passed with zero skips on Windows with Node.js 24. Native DSH verification used 0.2.1-rc.3; contract checks also cover interfaces first verified on 0.2.1-rc.2. Other host versions and third-party plugin combinations need additional community testing.

Known limits include model-dependent component selection, non-negative bar/line data, Wikimedia Commons-only search, external image CORS restrictions, and third-party theme compatibility. This release does not include experimental changes to other plugins.
