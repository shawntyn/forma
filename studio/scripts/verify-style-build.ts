import { resolve } from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const root = resolve(import.meta.dir, '..');
const files = await Array.fromAsync(new Bun.Glob('dist/assets/*.css').scan({ cwd: root }));
if (!files.length) throw new Error('Build the application before checking production CSS.');
const classes = new Set<string>();
for (const file of files) {
  const stylesheet = postcss.parse(await Bun.file(resolve(root, file)).text());
  stylesheet.walkAtRules((rule) => {
    if (rule.name === 'custom-media' || /--(?:viewport|container)-/.test(rule.params)) {
      throw new Error(`Unexpanded query in production CSS: @${rule.name} ${rule.params}`);
    }
  });
  stylesheet.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
    selectorParser((selectors) => {
      selectors.walkClasses((node) => {
        classes.add(node.value);
      });
    }).processSync(rule.selector);
  });
}
// These deliberately invalid candidates live in the lint regression fixtures.
// Their presence would mean Tailwind is scanning tests or verification scripts.
for (const candidate of [
  'p-[17px]',
  'bg-(--unknown)',
  'bg-(--unapproved)',
  'bg-[#fff]',
  'bg-action/50',
  'bg-red-500',
  'bg-blue-500',
  'bg-fake',
  'p-4',
]) {
  if (classes.has(candidate))
    throw new Error(`Lint fixture leaked into production CSS: ${candidate}`);
}
for (const candidate of ['px-sm', 'vp-sm:inline', 'hidden']) {
  if (!classes.has(candidate))
    throw new Error(`Missing application utility in production CSS: ${candidate}`);
}
console.log(
  `Production CSS verified: ${files.length} stylesheet(s), scoped sources and expanded queries.`,
);
