import { describe, expect, test } from 'bun:test';
import { checkCss, checkDesign, collectCssClasses } from './design-checker';

const theme = {
  path: '/project/src/index.css',
  content:
    '@theme { --*: initial; } @theme inline { --color-action: var(--ds-semantic-color-action); --spacing-md: var(--ds-semantic-space-gap); } @tailwind utilities;',
};
const variables = new Set([
  '--ds-semantic-color-action',
  '--ds-semantic-space-gap',
  '--ds-semantic-font-bodySize',
]);
const cssPolicy = { variables };

async function inspect(content: string, path = '/project/src/example.tsx') {
  return checkDesign({
    sources: [{ path, content: `import { cn } from '@/lib/utils';\n${content}` }],
    stylesheets: [
      {
        path: '/project/src/components.css',
        content:
          '.ds-button { color: var(--ds-semantic-color-action); } .selected:is(:hover, [data-selected]) {} .dark {}',
      },
    ],
    theme,
    cssPolicy,
  });
}

describe('actual Tailwind theme and source class policy', () => {
  test('accepts emitted semantic/layout utilities and exactly declared CSS classes', async () => {
    expect(
      await inspect(
        'export const View = () => <div className="bg-action p-md flex w-1/2 ds-button hover:bg-action" />;',
      ),
    ).toEqual([]);
    expect(collectCssClasses('.ds-button:hover, .selected:is(.dark) {}')).toEqual(
      new Set(['ds-button', 'selected', 'dark']),
    );
  });

  test('rejects missing tokens, reset defaults, and undeclared custom classes', async () => {
    const diagnostics = await inspect(
      'export const View = () => <div className="bg-fake p-4 bg-blue-500 ds-typo" />;',
    );
    expect(diagnostics.map((item) => item.rule)).toEqual([
      'known-class',
      'known-class',
      'known-class',
      'known-class',
    ]);
  });

  test('closes arbitrary values, variable shortcuts, variants and opacity modifiers', async () => {
    const diagnostics = await inspect(
      'export const View = () => <div className="p-[17px] bg-(--unknown) bg-action/50 bg-action/[.5] [&_p]:bg-action opacity-50" />;',
    );
    expect(diagnostics.filter((item) => item.rule === 'named-utility')).toHaveLength(4);
    expect(diagnostics.filter((item) => item.rule === 'effect-token')).toHaveLength(2);
  });

  test('follows cn, conditionals, object keys, arrays and typed static maps', async () => {
    expect(
      await inspect(`
      const variants = { primary: 'bg-action', secondary: 'p-md' } satisfies Record<string, string>;
      export const View = ({ selected, kind }: { selected: boolean; kind: keyof typeof variants }) =>
        <div className={cn('ds-button', selected && 'selected', [variants[kind]], { flex: selected })} />;
    `),
    ).toEqual([]);
    const diagnostics = await inspect(
      'const classes = "bg-fake"; export const View = () => <div className={cn(classes)} />;',
    );
    expect(diagnostics.some((item) => item.rule === 'known-class')).toBe(true);
  });

  test('rejects interpolation, concatenation, and unresolved runtime strings', async () => {
    const diagnostics = await inspect(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This fixture deliberately exercises rejected template interpolation.
      'export const View = ({ color, classes }) => <><div className={`bg-${color}`} /><div className={"bg-" + color} /><div className={classes} /></>;',
    );
    expect(diagnostics.filter((item) => item.rule === 'static-classes')).toHaveLength(3);
  });

  test('permits UI forwarding and React Aria callbacks, while checking their literals', async () => {
    expect(
      await inspect(
        `
      import { composeRenderProps } from 'react-aria-components';
      export const Input = ({ className }) => <input className={composeRenderProps(className, value => cn('ds-button', value))} />;
    `,
        '/project/src/components/ui/input.tsx',
      ),
    ).toEqual([]);
    const diagnostics = await inspect(
      'export const Input = ({ className }) => <input className={cn("bg-fake", className)} />;',
      '/project/src/components/ui/input.tsx',
    );
    expect(diagnostics.some((item) => item.rule === 'known-class')).toBe(true);
  });

  test('accepts an imported React Aria alias and checks its initial class input', async () => {
    const path = '/project/src/components/ui/input.tsx';
    expect(
      await inspect(
        `
      import { composeRenderProps as composeClasses } from 'react-aria-components';
      export const Input = ({ className }) => <input className={composeClasses(className, value => { return cn('ds-button', value); })} />;
    `,
        path,
      ),
    ).toEqual([]);
    const diagnostics = await inspect(
      `
      import { composeRenderProps } from 'react-aria-components';
      export const Input = () => <input className={composeRenderProps('bg-fake', value => cn('flex', value))} />;
    `,
      path,
    );
    expect(diagnostics.some((item) => item.rule === 'known-class')).toBe(true);
  });

  test('does not trust local, foreign or shadowed composeRenderProps functions', async () => {
    const local =
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This regression fixture deliberately constructs a forbidden dynamic class.
      'function composeRenderProps(a, b) { return `bg-${a}`; } export const Input = ({ className }) => <input className={composeRenderProps(className, value => cn("flex", value))} />;';
    const foreign =
      'import { composeRenderProps } from "./fake"; export const Input = ({ className }) => <input className={composeRenderProps(className, value => cn("flex", value))} />;';
    const shadowed =
      'import { composeRenderProps } from "react-aria-components"; export const Input = ({ className, composeRenderProps }) => <input className={composeRenderProps(className, value => cn("flex", value))} />;';
    for (const content of [local, foreign, shadowed]) {
      const diagnostics = await inspect(content, '/project/src/components/ui/input.tsx');
      expect(diagnostics.some((item) => item.rule === 'static-classes')).toBe(true);
    }
  });

  test('checks classList mutation strings', async () => {
    const diagnostics = await inspect(
      'export function update(node: Element) { node.classList.add("ds-typo"); node.classList.toggle("selected", true); }',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe('known-class');
  });

  test('does not trust a shadowed class combiner', async () => {
    const diagnostics = await inspect(
      'export const View = (cn) => <div className={cn("bg-action")} />;',
    );
    expect(diagnostics.some((item) => item.rule === 'static-classes')).toBe(true);
  });
});

describe('inline and imperative styles', () => {
  test('permits only imported approved helpers', async () => {
    expect(
      await inspect(`
      import { themeToStyle } from '@/lib/tokens';
      import { artboardFrameStyle as frame } from '@/lib/runtime-styles';
      export const View = ({ theme }) => <><div style={themeToStyle(theme)} /><div style={frame(300, 200, 1)} /></>;
    `),
    ).toEqual([]);
  });

  test('rejects local aliases, fake imports, helper shadowing and raw styles', async () => {
    const cases = [
      'const themeToStyle = () => ({ color: "red" }); export const View = () => <div style={themeToStyle()} />;',
      'import { themeToStyle } from "./fake/lib/tokens"; export const View = () => <div style={themeToStyle()} />;',
      'import { themeToStyle } from "@/lib/tokens"; export const View = (themeToStyle) => <div style={themeToStyle()} />;',
      'export const View = () => <div style={{ color: "red" }} />;',
    ];
    for (const content of cases)
      expect((await inspect(content)).some((item) => item.rule === 'runtime-style')).toBe(true);
  });

  test('rejects imperative style writes outside the helper module', async () => {
    const diagnostics = await inspect(
      'node.style.setProperty("color", "red"); node.style.color = "blue"; node.setAttribute("style", "color:red"); node.className = "bg-fake"; node.setAttribute("class", "bg-fake");',
    );
    expect(diagnostics.filter((item) => item.rule === 'runtime-style')).toHaveLength(3);
    expect(diagnostics.filter((item) => item.rule === 'known-class')).toHaveLength(2);
  });

  test('checks class and style properties hidden in direct or referenced JSX spreads', async () => {
    const diagnostics = await inspect(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This fixture deliberately exercises rejected template interpolation.
      'const attrs = { className: `bg-${color}` }; export const View = () => <><div {...{ className: "bg-fake", style: { color: "red" } }} /><div {...attrs} /></>;',
    );
    expect(diagnostics.filter((item) => item.rule === 'known-class')).toHaveLength(1);
    expect(diagnostics.filter((item) => item.rule === 'runtime-style')).toHaveLength(1);
    expect(diagnostics.filter((item) => item.rule === 'static-classes')).toHaveLength(1);
  });

  test('checks nested spreads and preserves controlled component prop forwarding', async () => {
    const diagnostics = await inspect(
      'const attrs = { className: "bg-fake" }; const nested = { ...attrs }; export const View = () => <div {...nested} />;',
    );
    expect(diagnostics[0]?.rule).toBe('known-class');
    expect(
      await inspect(
        'export const Button = ({ className, ...props }) => <button className={cn("ds-button", className)} {...props} />;',
        '/project/src/components/ui/button.tsx',
      ),
    ).toEqual([]);
  });
});

describe('CSS design values', () => {
  test('accepts registered semantic values and structural geometry', () => {
    const diagnostics = checkCss(
      {
        path: 'src/components.css',
        content:
          '.card { color: var(--ds-semantic-color-action); padding: var(--ds-semantic-space-gap); width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); transform: rotate(90deg); margin: 0; font-size: calc(var(--ds-semantic-font-bodySize) * 1em); }',
      },
      cssPolicy,
    );
    expect(diagnostics).toEqual([]);
  });

  test('rejects raw colors, dimensions, durations, font weights and unknown variables', () => {
    const diagnostics = checkCss(
      {
        path: 'src/components.css',
        content:
          '.card { color: red; background: #fff; padding: 17px; border-radius: .7rem; transition: color 200ms; font-weight: 600; border-color: var(--unapproved); }',
      },
      cssPolicy,
    );
    expect(diagnostics.filter((item) => item.rule === 'color-token')).toHaveLength(2);
    expect(diagnostics.filter((item) => item.rule === 'design-token')).toHaveLength(4);
    expect(diagnostics.filter((item) => item.rule === 'registered-variable')).toHaveLength(1);
  });

  test('cannot register a bypass locally or consume primitive colors directly', () => {
    const diagnostics = checkCss(
      {
        path: 'src/components.css',
        content: '.card { --unapproved: red; color: var(--ds-primitive-color-red); }',
      },
      { variables: new Set(['--ds-primitive-color-red']) },
    );
    expect(diagnostics.some((item) => item.rule === 'token-declaration')).toBe(true);
    expect(diagnostics.some((item) => item.rule === 'semantic-token')).toBe(true);
  });

  test('token generated files must match their registry exactly', () => {
    const generatedTokens = {
      path: 'src/style-tokens.css',
      content: ':root { --ds-primitive-color-red: red; }',
    };
    expect(checkCss(generatedTokens, { ...cssPolicy, generatedTokens })).toEqual([]);
    expect(
      checkCss(
        { ...generatedTokens, content: '.card { color: red; }' },
        { ...cssPolicy, generatedTokens },
      )[0]?.rule,
    ).toBe('generated-tokens');
  });

  test('responsive queries require registered names', () => {
    const validateQuery = (_kind: 'media' | 'container', params: string) => {
      if (params !== '(--viewport-compact)') throw new Error('Unknown breakpoint');
    };
    expect(
      checkCss(
        { path: 'src/a.css', content: '@media (--viewport-compact) { .card { display: flex; } }' },
        { ...cssPolicy, validateQuery },
      ),
    ).toEqual([]);
    expect(
      checkCss(
        { path: 'src/a.css', content: '@media (min-width: 999px) { .card { display: flex; } }' },
        { ...cssPolicy, validateQuery },
      )[0]?.rule,
    ).toBe('responsive-token');
  });

  test('cannot bypass design values with percentages, calc offsets or font keywords', () => {
    const diagnostics = checkCss(
      {
        path: 'src/a.css',
        content:
          '.card { opacity: 50%; padding: 17%; font-weight: bold; font-family: Inter; padding-top: calc(var(--ds-semantic-space-gap) + 1px); }',
      },
      cssPolicy,
    );
    expect(diagnostics.filter((item) => item.rule === 'design-token')).toHaveLength(5);
  });

  test('Tailwind theme declarations belong to the generated registry output', () => {
    const diagnostics = checkCss(
      {
        path: 'src/a.css',
        content: '@theme inline { --color-bypass: var(--ds-semantic-color-action); }',
      },
      cssPolicy,
    );
    expect(diagnostics[0]?.rule).toBe('theme-declaration');
    expect(collectCssClasses('@custom-variant dark (&:is(.dark *));')).toEqual(new Set(['dark']));
    expect(
      checkCss({ path: 'src/a.css', content: '.card { @apply p-[17px]; }' }, cssPolicy)[0]?.rule,
    ).toBe('token-recipe');
  });
});
