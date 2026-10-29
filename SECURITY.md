# Security

For a potential vulnerability, please use [GitHub private vulnerability reporting](https://github.com/cpsGGG/dsh-intelligent-ui/security/advisories/new) if the repository offers it. If that option is unavailable, open an issue that only asks for a private contact channel and does not contain exploit details, credentials, private answers, or personal files.

The current `0.6.x` release line is the initial supported line. Fixes are published in new tagged versions.

## Boundaries

- IUI renders a bounded set of validated components. It does not execute model-provided JavaScript or arbitrary HTML.
- The calculator uses a restricted expression parser.
- Image discovery sends a public-topic query to Wikimedia Commons and treats returned metadata as untrusted content.
- Images and native attachments keep DSH's loading and authorization mechanisms.
- PNG copying uses the browser clipboard and local rendering. External image CORS rules still apply.

These boundaries reduce risk but are not a claim of a completed independent security audit. Please keep DSH and the plugin up to date and review the data you include in public image searches.
