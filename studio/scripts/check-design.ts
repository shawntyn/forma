import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { TOKEN_DEFINITIONS } from '../src/lib/tokens';
import { expandTokenQuery, renderStyleTokensCss, STYLE_TOKENS } from '../src/lib/style-tokens';
import { checkDesign, type DesignSource } from './design-checker';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(projectRoot, 'src');
const tokenPath = resolve(sourceRoot, 'style-tokens.css');
// These two implementation boundaries necessarily accept runtime input. Their
// callers are checked here; dedicated unit tests cover their allowed outputs.
const runtimeBoundaries = new Set(['lib/utils.ts', 'lib/runtime-styles.ts']);

async function readSource(path: string): Promise<DesignSource> {
  return { path, content: await readFile(path, 'utf8') };
}

const sources: DesignSource[] = [];
for await (const path of new Bun.Glob('**/*.{ts,tsx}').scan({ cwd: sourceRoot })) {
  if (!/\.test\.[^.]+$/.test(path) && !runtimeBoundaries.has(path))
    sources.push(await readSource(resolve(sourceRoot, path)));
}
const stylesheets: DesignSource[] = [];
for await (const path of new Bun.Glob('**/*.css').scan({ cwd: sourceRoot }))
  stylesheets.push(await readSource(resolve(sourceRoot, path)));
const variables = new Set([
  ...TOKEN_DEFINITIONS.map((definition) => `--ds-${definition.path.replaceAll('.', '-')}`),
  ...Object.keys(STYLE_TOKENS),
]);
const diagnostics = await checkDesign({
  sources,
  stylesheets,
  theme: await readSource(resolve(sourceRoot, 'index.css')),
  cssPolicy: {
    variables,
    generatedTokens: { path: tokenPath, content: renderStyleTokensCss() },
    validateQuery: expandTokenQuery,
  },
  async loadStylesheet(id, base) {
    const path =
      id.startsWith('.') || id.startsWith('/')
        ? resolve(base, id)
        : Bun.resolveSync(id === 'tailwindcss' ? 'tailwindcss/index.css' : id, projectRoot);
    return { path, base: dirname(path), content: await readFile(path, 'utf8') };
  },
});
if (process.argv.includes('--json')) console.log(JSON.stringify(diagnostics, null, 2));
else {
  for (const diagnostic of diagnostics)
    console.error(
      `${diagnostic.path}:${diagnostic.line}:${diagnostic.column} [${diagnostic.rule}] ${diagnostic.message}`,
    );
  console.log(
    `Design policy: ${sources.length} source files, ${stylesheets.length} stylesheets, ${diagnostics.length} errors.`,
  );
}
if (diagnostics.length) process.exitCode = 1;
