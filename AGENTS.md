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
bun run build     # Check TypeScript and build dist/
bun start         # Serve the API and built frontend
```

For focused checks, use `bun test src/lib/tokens.test.ts`.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, single quotes, and semicolons. Use PascalCase for feature components, camelCase for functions, and kebab-case for utility filenames; UI primitives use lowercase filenames. Use `import type` for types. No formatter or linter is configured.

## Architecture Constraints

Keep React Aria interactions, json-render rendering, and the independent DTCG design system. Do not introduce shadcn dependencies or compatibility layers. Visual customization belongs exclusively to global primitive → semantic → component tokens and `--ds-*` variables. Never expose instance `style`, `className`, or executable props in page JSON. Extend strict catalog schemas and explicitly map props in `CanvasRenderer.tsx`. Preserve separate page/theme draft and published snapshots, revision checks, and versioned migrations.

## Testing Guidelines

Use `bun:test`; UI tests use Testing Library and happy-dom via `tests/setup.ts`. Name tests `*.test.ts` or `*.test.tsx`. No numerical coverage threshold is configured. Cover changed behavior, especially schema rejection, alias propagation, migrations, publishing isolation, and accessible interactions. Run relevant tests and the production build for code changes. Use temporary databases for browser publishing checks.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects, such as `Fix theme alias validation`. Keep commits focused on one change. PRs should explain behavior changes, link relevant issues, report validation, and include screenshots for UI changes.

## Configuration & Agent Continuity

Keep `.env*`, `data/`, and credentials untracked. Production requires Bun and persistent SQLite; see `studio/docs/cms.md`.

Discover available Memory tools, load context, and search project decisions before substantial work. Verify memories against code. Deduplicate and update confirmed decisions or progress in the existing Space; report unavailable tools honestly.
