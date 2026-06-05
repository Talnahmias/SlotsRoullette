# AGENTS.md

Guidance for AI agents working in this repository.

## Project status

**SlotsRoullette** is currently a greenfield repository: it contains only `README.md` (title line). There is no application source, dependency manifests, Docker setup, CI, or test/lint configuration yet.

When application code is added, update this file with concrete run/test/lint commands and service startup notes.

## Cursor Cloud specific instructions

### Services

No application services are defined. Nothing needs to run for local development until code and infrastructure are added (for example `package.json`, `docker-compose.yml`, or similar).

### VM toolchain (available for future development)

The Cloud Agent VM includes common tooling without extra install steps:

| Tool | Notes |
|------|--------|
| Git | Repository operations |
| Node.js | Via nvm (`node`, `npm`, `pnpm`, `yarn`) |
| Python 3 | `python3`, `pip` |

Docker is not required for the current repository contents.

### Lint / test / build / run

Not applicable until a stack and project layout exist. After adding code, document the canonical commands here and in `README.md` (for example `npm run dev`, `npm test`, `npm run lint`).

### Gotchas

- Do not assume hidden branches or monorepo packages; `main` is the only branch with a single initial commit.
- The VM update script is a no-op (`true`) because there are no dependencies to refresh on startup.
