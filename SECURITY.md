# Security Policy

## Supported versions

This project does not ship numbered releases yet. Security fixes are applied on
`master` and should be assumed to apply to the latest commit.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.
Conduct or community issues belong in the [Code of Conduct](CODE_OF_CONDUCT.md),
not here.

Report them privately via GitHub's
[private vulnerability reporting](https://github.com/fasaled/rota-wise/security/advisories/new)
on this repository.

Include:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- Affected commit SHA or deployment URL if known

You should receive an acknowledgement. Please give a reasonable window before
any public disclosure so a fix can land.

## What this app stores

Rota-Wise is a **fully client-side** application. There is no application
server, no account system, and no telemetry.

Schedule data lives in:

- The browser's IndexedDB (`rotawise` database) as a working copy
- An optional `.rw` file on the user's disk (File System Access API, or a
  download)

A hosted deployment still serves static assets. Anyone who can open the app in
a browser can see whatever schedule is stored **in that browser profile**. Treat
shared or public computers accordingly.

See [docs/privacy.md](docs/privacy.md) for the full data-handling description.

## Scope notes

- This is **not** a certified medical device. Generated rotas must be reviewed
  by the people who use them.
- The service worker caches static assets for offline use. It does not sync
  roster data to any remote store.
- Word export (`.docx`) is generated locally in the browser.
