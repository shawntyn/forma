# Repository Guidelines

## Project Structure & Module Organization

The application lives in `studio/`:

- `src/components/{cms,editor,ui}/`: administration, page editor, and reusable React components.
- `src/lib/`: catalog schemas, tokens, document operations, and routing.
- `server/`: Bun API and SQLite persistence; `scripts/`: development launcher.
- `tests/` and adjacent `*.test.*` files: regression tests and fixtures.
- `examples/`: portable page JSON; `docs/`: architecture notes and screenshots.
- `dist/`: generated production assets; do not edit manually.

## Build, Test, and Development Commands

Run commands from `studio/`:

```sh
bun install       # Install dependencies using bun.lock
bun run dev       # Start Vite and the Bun API
bun test          # Run tests
bun run lint      # Biome rules and design-system policy checks
bun run format    # Apply the repository formatter
bun run check     # Rule probes, lint, formatting, tests, and production build
bun run build     # Verify generated tokens, TypeScript, and production CSS
bun run verify:browser # Check built assets using a temporary database and Chrome
bun start         # Serve the API and built frontend
```

For focused checks, use `bun test src/lib/tokens.test.ts`.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, single quotes, and semicolons. Use PascalCase for feature components, camelCase for functions, and kebab-case for utility filenames; UI primitives use lowercase filenames. Use `import type` for types. Biome handles formatting and general lint rules; `scripts/check-design.ts` enforces the design-system boundaries. See `studio/docs/lint-coverage.md` for measured rule coverage and explicit exceptions.

## Architecture Constraints

Keep React Aria interactions, json-render rendering, and the independent DTCG design system. Do not introduce shadcn dependencies or compatibility layers. Visual customization belongs exclusively to global primitive → semantic → component tokens and `--ds-*` variables. Never expose instance `style`, `className`, or executable props in page JSON. Extend strict catalog schemas and explicitly map props in `CanvasRenderer.tsx`. Preserve separate page/theme draft and published snapshots, revision checks, and versioned migrations.

Persisted Theme v2 remains the 86-token profile in `src/lib/tokens.ts`. Code-owned chrome, recipe geometry, and viewport/container breakpoints live in `src/lib/style-tokens.ts`; regenerate `src/style-tokens.css` with `bun run tokens:generate`, never edit it directly. CSS consumes semantic/component variables; Tailwind exposes only registered semantic utilities and structural utilities. Use complete static class names, named queries, and approved runtime helpers in `src/lib/runtime-styles.ts` for canvas geometry and preset previews. Do not add raw design values, primitive consumption, arbitrary utilities, or instance styling to bypass the checks.

## Testing Guidelines

Use `bun:test`; UI tests use Testing Library and happy-dom via `tests/setup.ts`. Name tests `*.test.ts` or `*.test.tsx`. No numerical coverage threshold is configured. Cover changed behavior, especially schema rejection, alias propagation, migrations, publishing isolation, and accessible interactions. Run `bun run check` for code changes and `bun run verify:browser` after building UI changes. The browser verifier uses a temporary database and writes ignored screenshots to `.reports/browser`; use system Chrome on macOS, `CHROME_PATH`, or install Chromium via `bunx --no-install playwright-core install chromium`.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects, such as `Fix theme alias validation`. Keep commits focused on one change. PRs should explain behavior changes, link relevant issues, report validation, and include screenshots for UI changes.

## Configuration & Agent Continuity

Keep `.env*`, `data/`, and credentials untracked. Production requires Bun and persistent SQLite; see `studio/docs/cms.md`.

Discover available Memory tools, load context, and search project decisions before substantial work. Verify memories against code. Deduplicate and update confirmed decisions or progress in the existing Space; report unavailable tools honestly.
