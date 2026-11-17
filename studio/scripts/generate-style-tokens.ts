import { renderStyleTokensCss } from '../src/lib/style-tokens';

const file = Bun.file(new URL('../src/style-tokens.css', import.meta.url));
const generated = renderStyleTokensCss();
if (process.argv.includes('--check')) {
  if (!(await file.exists()) || (await file.text()) !== generated) {
    console.error('Style tokens are stale. Run bun scripts/generate-style-tokens.ts.');
    process.exitCode = 1;
  }
} else {
  await Bun.write(file, generated);
}
