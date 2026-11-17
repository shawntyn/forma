import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface Diagnostic {
  category: string;
  message: string;
}

interface Probe {
  name: string;
  expression: string;
  categories: string[];
}

const projectRoot = resolve(import.meta.dir, '..');
const config = JSON.parse(await readFile(join(projectRoot, 'biome.json'), 'utf8'));
const packageJson = JSON.parse(
  await readFile(join(projectRoot, 'node_modules/@biomejs/biome/package.json'), 'utf8'),
);
const cli = join(projectRoot, 'node_modules/@biomejs/biome/bin/biome');
const directory = await mkdtemp(join(tmpdir(), 'forma-biome-coverage-'));
const rule = (name: string) => `lint/nursery/${name}`;
const probes: Probe[] = [
  {
    name: 'semantic tokens, layout and declared recipe',
    expression: '"bg-action p-md flex ds-button"',
    categories: [],
  },
  { name: 'raw palette', expression: '"bg-blue-500"', categories: [rule('noTailwindRawColors')] },
  { name: 'raw white', expression: '"text-white"', categories: [rule('noTailwindRawColors')] },
  {
    name: 'arbitrary value',
    expression: '"p-[17px]"',
    categories: [rule('noTailwindArbitraryValue')],
  },
  {
    name: 'arbitrary property',
    expression: '"[color:red]"',
    categories: [rule('noTailwindArbitraryValue')],
  },
  {
    name: 'dynamic interpolation',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Deliberately invalid source text for the lint probe.
    expression: '{`bg-${color}`}',
    categories: [rule('useTailwindStaticClassStrings')],
  },
  {
    name: 'cn arguments',
    expression: '{cn("p-[17px]", "bg-blue-500")}',
    categories: [rule('noTailwindArbitraryValue'), rule('noTailwindRawColors')],
  },
  {
    name: 'restricted opacity',
    expression: '"opacity-50"',
    categories: [rule('noTailwindRestrictedClasses')],
  },
  {
    name: 'restricted arbitrary variant',
    expression: '"[&_p]:flex"',
    categories: [rule('noTailwindRestrictedClasses')],
  },
  // These expected gaps are enforced by the project design checker, not silently accepted.
  { name: 'GAP: unknown class', expression: '"bg-fake typo-class"', categories: [] },
  { name: 'GAP: removed default spacing', expression: '"p-4"', categories: [] },
  { name: 'GAP: variable shorthand', expression: '"bg-(--unknown)"', categories: [] },
  {
    name: 'GAP: color opacity modifiers',
    expression: '"bg-action/50 bg-action/[.5]"',
    categories: [],
  },
];

function lint(file: string, only?: string): Diagnostic[] {
  const result = Bun.spawnSync(
    [process.execPath, cli, 'lint', '--reporter=json', ...(only ? [`--only=${only}`] : []), file],
    { cwd: directory, env: { ...process.env, NO_COLOR: '1' } },
  );
  const stdout = result.stdout.toString();
  assert.ok(stdout.startsWith('{'), result.stderr.toString() || stdout);
  const report = JSON.parse(stdout) as { diagnostics: Diagnostic[] };
  assert.ok(result.exitCode === 0 || result.exitCode === 1, result.stderr.toString());
  return report.diagnostics;
}

try {
  await writeFile(
    join(directory, 'biome.json'),
    JSON.stringify({
      root: true,
      tailwind: { ...config.tailwind, stylesheet: './theme.css' },
      formatter: { enabled: false },
      assist: { enabled: false },
      linter: {
        rules: {
          preset: 'none',
          nursery: { ...config.linter.rules.nursery, noUndeclaredClasses: 'error' },
        },
      },
    }),
  );
  await writeFile(
    join(directory, 'theme.css'),
    '@theme { --*: initial; }\n' +
      '@theme inline { --color-action: var(--ds-semantic-color-action); --spacing-md: var(--ds-semantic-space-gap); }\n' +
      '.ds-button { display: flex; }\n',
  );

  // noUndeclaredClasses checks literal CSS selectors, so test it separately from the production rules.
  const probeConfig = JSON.parse(await readFile(join(directory, 'biome.json'), 'utf8'));
  delete probeConfig.linter.rules.nursery.noUndeclaredClasses;
  await writeFile(join(directory, 'biome.json'), JSON.stringify(probeConfig));
  for (const [index, probe] of probes.entries()) {
    const filename = `probe-${index}.tsx`;
    await writeFile(
      join(directory, filename),
      'import "./theme.css";\n' +
        'declare const color: string; declare function cn(...classes: string[]): string;\n' +
        `export const sample = <div className=${probe.expression} />;\n`,
    );
    const diagnostics = lint(filename);
    const categories = [...new Set(diagnostics.map((diagnostic) => diagnostic.category))].sort();
    assert.deepEqual(categories, [...probe.categories].sort(), probe.name);
    console.log(`Verified: ${probe.name}`);
  }

  probeConfig.linter.rules.nursery.noUndeclaredClasses = 'error';
  await writeFile(join(directory, 'biome.json'), JSON.stringify(probeConfig));
  const undeclared = lint('probe-0.tsx', 'noUndeclaredClasses');
  assert.equal(undeclared.length, 3, 'Expected false positives for bg-action, p-md and flex');
  assert.ok(undeclared.every((diagnostic) => diagnostic.category === rule('noUndeclaredClasses')));
  assert.ok(undeclared.every((diagnostic) => !diagnostic.message.includes('ds-button')));
  console.log(
    `Biome ${packageJson.version}: ${probes.length} probes and CSS-selector limitation verified.`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
