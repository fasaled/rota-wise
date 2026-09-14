# Contributing to Rota-Wise

Thanks for taking the time to contribute. Please read this guide before opening
a pull request.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
Contributions are licensed under the [GNU AGPL v3 or later](LICENSE).

## Development setup

**Prerequisite:** [Bun](https://bun.sh) 1.1 or later.

```bash
git clone https://github.com/fasaled/rota-wise.git
cd rota-wise
bun install
bun run dev          # http://localhost:5173
```

Use Bun for install, scripts, and unit tests. Do not add an `package-lock.json`
or switch the repo to npm/yarn.

## Verify changes

Run these in order before opening a PR:

```bash
bun run lint
bun run typecheck
bun test
```

End-to-end tests (Playwright, Chromium):

```bash
bun run e2e:install
bun run e2e
```

## Project conventions

- **Client-only.** No API routes, no server actions, no backend. All scheduling
  and persistence run in the browser.
- **Never call `generateSchedule` on the main thread.** Use
  `useScheduleWorker` / `src/workers/schedule.worker.ts`.
- **i18n.** Every new user-facing string goes in both `src/locales/en.json` and
  `src/locales/es.json`.
- **Do not edit `src/components/ui/` by hand.** Those are shadcn/ui primitives;
  regenerate them with the shadcn CLI if needed.
- **Lazy-load heavy UI.** Calendar, summaries, and `docx` export should stay
  behind `React.lazy` / dynamic `import()`.
- **Tests.** Algorithm, storage, warnings, and hooks live in `src/__tests__/`.
  UI components are not unit-tested; journeys belong in `e2e/`.
- **Do not commit** generated PWA files (`public/sw.js`, `public/workbox-*.js`),
  `dist/`, or `.env*` files.

## Documentation

If you change behaviour, update the matching doc in the same PR:

| Change | Document |
|---|---|
| Scoring, hard/soft constraints, coverage | [`docs/algorithm.md`](docs/algorithm.md) |
| Persistence, workers, module boundaries | [`docs/architecture.md`](docs/architecture.md) |
| `.rw` shape or `fileVersion` | [`docs/file-format.md`](docs/file-format.md) |
| Visible UI or interaction | [`docs/ui-reference.md`](docs/ui-reference.md) |
| Interaction / UX rationale | [`docs/usability.md`](docs/usability.md) |

All documentation is written in **English**.

## Pull requests

- Keep the scope focused. Separate refactors from behaviour changes.
- Prefer English for PR titles, descriptions, and new commit messages.
- Fill in the pull request template.
- Do not include secrets, real patient/staff rosters, or personal schedule
  files in fixtures. Use synthetic names (`Dr. Smith`, `Ward A`).

## Issues

Use the GitHub issue templates. Search existing issues first.

Security reports go through [SECURITY.md](SECURITY.md), not public issues.
