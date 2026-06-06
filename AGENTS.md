# AGENTS.md

Guidance for AI agents working in this repository.

## Project status

**Zombie Slots: Graveyard Defense** is a self-contained browser game built with
vanilla HTML / CSS / JavaScript. There is **no build step and no dependencies**.

Key files:

- `index.html` — markup (menu, game screen, shop/game-over overlays)
- `css/styles.css` — theme, portrait layout, animations
- `js/data.js` — static game data (symbols, combos, zombies, bosses, waves, upgrades, research)
- `js/game.js` — game engine (state, spins, combat, waves, shop, meta progression, rendering)
- `assets/icon.png` — generated app icon

## Cursor Cloud specific instructions

### Services

The game is static files. Serve the repo root and open `index.html`:

```bash
python3 -m http.server 8080   # then open http://localhost:8080/index.html
```

There is no backend, database, or other service to run.

### Lint / test / build / run

- **Build:** none required (static files).
- **Syntax check:** `node --check js/data.js && node --check js/game.js`
- **Run/test:** serve with `python3 -m http.server 8080` and exercise the game in a
  browser. The whole UI is portrait-first; on desktop widths it renders as a centered
  device frame so the entire panel (incl. the top HUD) is visible.

### Testing notes

- Persistent meta progression is stored in `localStorage` under `zombieSlots.meta.v1`.
- There is no built-in debug API in committed code; to fast-forward during manual
  testing you can temporarily expose helpers, but do not commit them.

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
