import { parse } from '@babel/parser';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import { compile } from 'tailwindcss';

export interface DesignSource {
  path: string;
  content: string;
}

export interface DesignDiagnostic {
  path: string;
  line: number;
  column: number;
  rule: string;
  message: string;
}

type AstNode = {
  type: string;
  start?: number | null;
  loc?: { start: { line: number; column: number } } | null;
  [key: string]: unknown;
};

type Binding = {
  kind: 'value' | 'parameter' | 'import' | 'function';
  node: AstNode;
  source?: string;
  imported?: string;
};
type Scope = { parent?: Scope; bindings: Map<string, Binding> };
type ClassUse = { value: string; node: AstNode; source: DesignSource };

const classFunctions = new Set(['cn', 'clsx', 'classnames', 'twMerge', 'twJoin']);
const styleHelpers = new Set([
  'artboardFrameStyle',
  'artboardTransformStyle',
  'layerIndentStyle',
  'tokenSwatchStyle',
]);
const runtimeVariables = new Set([
  '--ds-runtime-layer-depth',
  '--ds-runtime-artboard-width',
  '--ds-runtime-artboard-height',
  '--ds-runtime-artboard-scale',
  '--ds-runtime-swatch-color',
]);
const structuralProperties = new Set([
  'flex',
  'flex-grow',
  'flex-shrink',
  'order',
  'grid-column',
  'grid-row',
  'grid-column-start',
  'grid-column-end',
  'grid-row-start',
  'grid-row-end',
  'aspect-ratio',
  'column-count',
  'grid-template-columns',
  'grid-template-rows',
]);
const cssGlobals = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']);
const percentageGeometry = new Set([
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'inline-size',
  'block-size',
  'inset',
  'inset-inline',
  'inset-block',
  'top',
  'right',
  'bottom',
  'left',
  'transform',
  'transform-origin',
  'background-position',
  'background-size',
  'flex-basis',
]);
const namedColors = new Set(
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
    ' ',
  ),
);

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function children(node: AstNode): AstNode[] {
  return Object.entries(node).flatMap(([key, value]) =>
    key === 'loc' || key === 'comments'
      ? []
      : Array.isArray(value)
        ? value.filter(isNode)
        : isNode(value)
          ? [value]
          : [],
  );
}

function child(node: AstNode, key: string): AstNode | undefined {
  return isNode(node[key]) ? node[key] : undefined;
}

function text(node: AstNode | undefined): string | undefined {
  if (!node) return undefined;
  return typeof node.name === 'string'
    ? node.name
    : typeof node.value === 'string'
      ? node.value
      : undefined;
}

function unwrap(node: AstNode): AstNode {
  if (
    [
      'TSAsExpression',
      'TSSatisfiesExpression',
      'TSNonNullExpression',
      'ParenthesizedExpression',
      'TypeCastExpression',
    ].includes(node.type)
  ) {
    return unwrap(child(node, 'expression') ?? node);
  }
  return node;
}

function bindPattern(node: AstNode | undefined, scope: Scope, binding: Binding) {
  if (!node) return;
  if (node.type === 'Identifier' && typeof node.name === 'string')
    scope.bindings.set(node.name, binding);
  else if (node.type === 'ObjectPattern') {
    for (const property of children(node))
      bindPattern(child(property, 'value') ?? child(property, 'argument'), scope, binding);
  } else if (node.type === 'AssignmentPattern') bindPattern(child(node, 'left'), scope, binding);
  else if (node.type === 'ArrayPattern')
    for (const element of children(node)) bindPattern(element, scope, binding);
  else if (node.type === 'RestElement') bindPattern(child(node, 'argument'), scope, binding);
}

function analyzeSource(source: DesignSource, diagnostics: DesignDiagnostic[]): ClassUse[] {
  const ast = parse(source.content, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  }) as unknown as AstNode;
  const scopes = new WeakMap<AstNode, Scope>();
  const allNodes: AstNode[] = [];
  const initialScope: Scope = { bindings: new Map() };
  function index(node: AstNode, inherited: Scope) {
    let scope = inherited;
    if (node.type === 'FunctionDeclaration' && child(node, 'id'))
      bindPattern(child(node, 'id'), inherited, { kind: 'function', node });
    if (
      [
        'Program',
        'BlockStatement',
        'FunctionDeclaration',
        'FunctionExpression',
        'ArrowFunctionExpression',
        'CatchClause',
      ].includes(node.type)
    ) {
      scope = { parent: inherited, bindings: new Map() };
    }
    scopes.set(node, scope);
    allNodes.push(node);
    if (node.type.includes('Function')) {
      for (const parameter of Array.isArray(node.params) ? node.params.filter(isNode) : [])
        bindPattern(parameter, scope, { kind: 'parameter', node: parameter });
    }
    if (node.type === 'VariableDeclarator')
      bindPattern(child(node, 'id'), scope, { kind: 'value', node: child(node, 'init') ?? node });
    if (node.type === 'ImportDeclaration') {
      const module = text(child(node, 'source'));
      for (const specifier of children(node).filter((item) => item.type.startsWith('Import'))) {
        bindPattern(child(specifier, 'local'), scope, {
          kind: 'import',
          node: specifier,
          source: module,
          imported: text(child(specifier, 'imported')),
        });
      }
    }
    for (const nested of children(node)) index(nested, scope);
  }
  index(ast, initialScope);
  function binding(node: AstNode, name: string): Binding | undefined {
    let scope = scopes.get(node);
    while (scope) {
      const found = scope.bindings.get(name);
      if (found) return found;
      scope = scope.parent;
    }
    return undefined;
  }
  const uses: ClassUse[] = [];
  const seen = new Set<AstNode>();
  const forwarding = /(?:^|\/)src\/components\/ui\//.test(source.path);
  function importedCombiner(node: AstNode): boolean {
    if (node.type !== 'Identifier') return false;
    const found = binding(node, String(node.name));
    if (found?.kind !== 'import' || !found.source) return false;
    const module = found.source.startsWith('.')
      ? resolve(dirname(source.path), found.source).replace(/\.(?:ts|tsx)$/, '')
      : found.source;
    return (
      ['clsx', 'classnames', 'tailwind-merge'].includes(module) ||
      ((module === '@/lib/utils' || module.endsWith('/src/lib/utils')) && found.imported === 'cn')
    );
  }
  function importedRenderProps(node: AstNode): boolean {
    if (node.type !== 'Identifier') return false;
    const found = binding(node, String(node.name));
    return (
      found?.kind === 'import' &&
      found.source === 'react-aria-components' &&
      found.imported === 'composeRenderProps'
    );
  }
  function report(node: AstNode, rule: string, message: string) {
    diagnostics.push({
      path: source.path,
      line: node.loc?.start.line ?? 1,
      column: (node.loc?.start.column ?? 0) + 1,
      rule,
      message,
    });
  }
  function visitClass(raw: AstNode | undefined, resolving = new Set<AstNode>()) {
    if (!raw) return;
    const node = unwrap(raw);
    if (seen.has(node) || resolving.has(node)) return;
    seen.add(node);
    resolving = new Set(resolving).add(node);
    if (node.type === 'StringLiteral') {
      for (const value of String(node.value).split(/\s+/).filter(Boolean))
        uses.push({ value, node, source });
    } else if (node.type === 'TemplateLiteral') {
      if (Array.isArray(node.expressions) && node.expressions.length)
        report(
          node,
          'static-classes',
          'Use complete class strings or a static class map, not template interpolation.',
        );
      else {
        const quasis = (Array.isArray(node.quasis) ? node.quasis : []) as AstNode[];
        for (const quasi of quasis) {
          const value = quasi.value as { cooked?: string; raw?: string };
          for (const token of (value.cooked ?? value.raw ?? '').split(/\s+/).filter(Boolean))
            uses.push({ value: token, node, source });
        }
      }
    } else if (node.type === 'ConditionalExpression') {
      visitClass(child(node, 'consequent'), resolving);
      visitClass(child(node, 'alternate'), resolving);
    } else if (node.type === 'LogicalExpression') {
      if (node.operator !== '&&') visitClass(child(node, 'left'), resolving);
      visitClass(child(node, 'right'), resolving);
    } else if (node.type === 'ArrayExpression') {
      for (const element of Array.isArray(node.elements) ? node.elements.filter(isNode) : [])
        visitClass(element, resolving);
    } else if (node.type === 'ObjectExpression') {
      for (const property of children(node)) {
        if (property.type === 'SpreadElement' || property.computed)
          report(property, 'static-classes', 'Class object keys must be statically written.');
        else {
          const key = child(property, 'key');
          if (key?.type === 'Identifier') uses.push({ value: String(key.name), node: key, source });
          else visitClass(key, resolving);
        }
      }
    } else if (node.type === 'Identifier') {
      if (node.name === 'undefined') return;
      const found = binding(node, String(node.name));
      if (found?.kind === 'value') visitClass(found.node, resolving);
      else if (
        forwarding &&
        found?.kind === 'parameter' &&
        ['className', 'value'].includes(String(node.name))
      )
        return;
      else
        report(
          node,
          'static-classes',
          `Cannot prove that ${String(node.name)} contains approved static classes.`,
        );
    } else if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      const object = child(node, 'object');
      const found =
        object?.type === 'Identifier' ? binding(object, String(object.name)) : undefined;
      const map =
        found?.kind === 'value' ? unwrap(found.node) : object ? unwrap(object) : undefined;
      if (map?.type === 'ObjectExpression') {
        for (const property of children(map)) {
          if (property.type !== 'ObjectProperty' || property.computed)
            report(
              property,
              'static-classes',
              'Class maps must contain explicit keys and complete class strings.',
            );
          else visitClass(child(property, 'value'), resolving);
        }
      } else
        report(
          node,
          'static-classes',
          'Resolve class selections through a local static class map.',
        );
    } else if (node.type === 'CallExpression') {
      const callee = child(node, 'callee');
      const args = Array.isArray(node.arguments) ? node.arguments.filter(isNode) : [];
      if (callee && importedCombiner(callee))
        for (const argument of args) visitClass(argument, resolving);
      else if (callee && importedRenderProps(callee)) {
        visitClass(args[0], resolving);
        const callback = args[1];
        if (callback?.type === 'ArrowFunctionExpression' || callback?.type === 'FunctionExpression')
          visitClass(callback, resolving);
        else
          report(
            node,
            'static-classes',
            'composeRenderProps must use a statically inspectable class callback.',
          );
      } else {
        const found =
          callee?.type === 'Identifier' ? binding(callee, String(callee.name)) : undefined;
        if (found?.kind === 'function') {
          const returns = (root: AstNode): AstNode[] =>
            root.type === 'ReturnStatement' ? [root] : children(root).flatMap(returns);
          for (const returned of returns(found.node))
            visitClass(child(returned, 'argument'), resolving);
        } else
          report(
            node,
            'static-classes',
            'Use an inspectable local class recipe or the approved class combiners.',
          );
      }
    } else if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
      const body = child(node, 'body');
      if (body?.type !== 'BlockStatement') visitClass(body, resolving);
      else
        for (const item of children(body))
          if (item.type === 'ReturnStatement') visitClass(child(item, 'argument'), resolving);
    } else if (!['NullLiteral', 'BooleanLiteral', 'NumericLiteral'].includes(node.type)) {
      report(
        node,
        'static-classes',
        'Class names must be statically inspectable; concatenation and computed strings are prohibited.',
      );
    }
  }
  function approvedStyle(node: AstNode): boolean {
    const expression = unwrap(node);
    if (expression.type !== 'CallExpression') return false;
    const callee = child(expression, 'callee');
    if (callee?.type !== 'Identifier') return false;
    const imported = binding(callee, String(callee.name));
    if (imported?.kind !== 'import' || !imported.source) return false;
    const name = imported.imported;
    const module = imported.source.startsWith('.')
      ? resolve(dirname(source.path), imported.source).replace(/\.(?:ts|tsx)$/, '')
      : imported.source;
    return (
      (name === 'themeToStyle' &&
        (module === '@/lib/tokens' || module.endsWith('/src/lib/tokens'))) ||
      (!!name &&
        styleHelpers.has(name) &&
        (module === '@/lib/runtime-styles' || module.endsWith('/src/lib/runtime-styles')))
    );
  }
  function visitProps(raw: AstNode | undefined, resolving = new Set<AstNode>()) {
    if (!raw) return;
    const node = unwrap(raw);
    if (resolving.has(node)) return;
    resolving = new Set(resolving).add(node);
    if (node.type === 'Identifier') {
      const found = binding(node, String(node.name));
      if (found?.kind === 'value') visitProps(found.node, resolving);
      // Component prop forwarding is a deliberate boundary. The component's
      // source callers are checked; this is not a whole-program taint analyzer.
      else if (found?.kind !== 'parameter')
        report(
          node,
          'static-props',
          'JSX spread objects must be statically inspectable or component parameters.',
        );
    } else if (node.type === 'ObjectExpression') {
      for (const property of children(node)) {
        if (property.type === 'SpreadElement') visitProps(child(property, 'argument'), resolving);
        else if (property.type === 'ObjectProperty') {
          const key = child(property, 'key');
          if (property.computed && key?.type !== 'StringLiteral')
            report(
              property,
              'static-props',
              'Computed JSX property names can hide class/style overrides.',
            );
          const name = text(key);
          if (name === 'className' || name === 'class') visitClass(child(property, 'value'));
          if (name === 'style') {
            const value = child(property, 'value');
            if (!value || !approvedStyle(value))
              report(
                property,
                'runtime-style',
                'Spread styles must come from an imported approved theme/runtime helper.',
              );
          }
        }
      }
    } else if (node.type === 'ConditionalExpression') {
      visitProps(child(node, 'consequent'), resolving);
      visitProps(child(node, 'alternate'), resolving);
    } else if (node.type === 'LogicalExpression') {
      if (node.operator !== '&&') visitProps(child(node, 'left'), resolving);
      visitProps(child(node, 'right'), resolving);
    } else if (!['NullLiteral', 'BooleanLiteral'].includes(node.type))
      report(node, 'static-props', 'JSX spread objects must be statically inspectable.');
  }
  for (const node of allNodes) {
    if (node.type === 'JSXSpreadAttribute') visitProps(child(node, 'argument'));
    if (node.type === 'JSXAttribute') {
      const name = text(child(node, 'name'));
      const value = child(node, 'value');
      const expression =
        value?.type === 'JSXExpressionContainer' ? child(value, 'expression') : value;
      if (name === 'className' || name === 'class') visitClass(expression);
      if (name === 'style' && (!expression || !approvedStyle(expression)))
        report(
          node,
          'runtime-style',
          'Inline styles must come from an imported, approved theme or runtime geometry helper.',
        );
    }
    if (node.type === 'CallExpression') {
      const callee = child(node, 'callee');
      if (callee?.type === 'Identifier' && classFunctions.has(String(callee.name))) {
        for (const argument of Array.isArray(node.arguments) ? node.arguments.filter(isNode) : [])
          visitClass(argument);
      }
      if (callee?.type === 'MemberExpression') {
        const object = child(callee, 'object');
        const property = text(child(callee, 'property'));
        if (property === 'setAttribute') {
          const args = Array.isArray(node.arguments) ? node.arguments.filter(isNode) : [];
          const name = text(args[0]);
          if (name === 'class') visitClass(args[1]);
          if (name === 'style')
            report(
              node,
              'runtime-style',
              'DOM style writes belong in the approved runtime style helper module.',
            );
        }
        if (
          object?.type === 'MemberExpression' &&
          text(child(object, 'property')) === 'classList' &&
          ['add', 'remove', 'toggle', 'replace'].includes(property ?? '')
        ) {
          const args = Array.isArray(node.arguments) ? node.arguments.filter(isNode) : [];
          for (const argument of property === 'toggle' ? args.slice(0, 1) : args)
            visitClass(argument);
        }
        if (object?.type === 'MemberExpression' && text(child(object, 'property')) === 'style')
          report(
            node,
            'runtime-style',
            'DOM style writes belong in the approved runtime style helper module.',
          );
      }
    }
    if (node.type === 'AssignmentExpression') {
      const left = child(node, 'left');
      const object = left ? child(left, 'object') : undefined;
      if (left?.type === 'MemberExpression' && text(child(left, 'property')) === 'className')
        visitClass(child(node, 'right'));
      if (object?.type === 'MemberExpression' && text(child(object, 'property')) === 'style')
        report(
          node,
          'runtime-style',
          'DOM style writes belong in the approved runtime style helper module.',
        );
    }
  }
  return uses;
}

export interface CssPolicy {
  variables: ReadonlySet<string>;
  generatedTokens?: { path: string; content: string };
  validateQuery?: (kind: 'media' | 'container', params: string) => void;
}

export function checkCss(source: DesignSource, policy: CssPolicy): DesignDiagnostic[] {
  if (source.path === policy.generatedTokens?.path) {
    return source.content === policy.generatedTokens.content
      ? []
      : [
          {
            path: source.path,
            line: 1,
            column: 1,
            rule: 'generated-tokens',
            message: 'Generated token CSS differs from its registry. Run the token generator.',
          },
        ];
  }
  const diagnostics: DesignDiagnostic[] = [];
  const root = postcss.parse(source.content, { from: source.path });
  function report(node: postcss.Node, rule: string, message: string) {
    diagnostics.push({
      path: source.path,
      line: node.source?.start?.line ?? 1,
      column: node.source?.start?.column ?? 1,
      rule,
      message,
    });
  }
  root.walkAtRules((rule) => {
    if (rule.name === 'apply')
      report(
        rule,
        'token-recipe',
        'CSS recipes must consume registered variables directly; @apply can bypass the utility policy.',
      );
    if (rule.name === 'media' || rule.name === 'container') {
      try {
        if (!policy.validateQuery)
          throw new Error('Responsive queries must use registered viewport/container tokens.');
        policy.validateQuery(rule.name, rule.params);
      } catch (error) {
        report(
          rule,
          'responsive-token',
          error instanceof Error ? error.message : 'Unregistered responsive query.',
        );
      }
    }
  });
  root.walkDecls((declaration) => {
    const inTheme =
      declaration.parent?.type === 'atrule' &&
      (declaration.parent as postcss.AtRule).name === 'theme';
    if (inTheme)
      report(
        declaration,
        'theme-declaration',
        'Tailwind theme declarations must be generated from the approved token registry.',
      );
    if (declaration.prop.startsWith('--') && !inTheme)
      report(
        declaration,
        'token-declaration',
        'Define custom properties in the registered token source, not component CSS.',
      );
    const parsed = valueParser(declaration.value);
    const hasVariable = declaration.value.includes('var(');
    if (
      ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'].includes(
        declaration.prop,
      ) &&
      !hasVariable &&
      !cssGlobals.has(declaration.value) &&
      !['normal', '0'].includes(declaration.value) &&
      !/[\d]/.test(declaration.value)
    )
      report(
        declaration,
        'design-token',
        `Use a registered typography token for ${declaration.prop}.`,
      );
    const unitBases = new Set<object>();
    parsed.walk((node) => {
      if (
        node.type !== 'function' ||
        !['calc', 'min', 'max', 'clamp'].includes(node.value) ||
        !valueParser.stringify(node).includes('var(')
      )
        return;
      const terms = node.nodes.filter((term) => term.type !== 'space' && term.type !== 'comment');
      terms.forEach((term, index) => {
        if (terms[index - 1]?.value === '*' || terms[index + 1]?.value === '*') unitBases.add(term);
      });
    });
    parsed.walk((node) => {
      if (node.type === 'function' && node.value === 'var') {
        const variable = node.nodes.find((item) => item.type === 'word')?.value ?? '';
        if (!policy.variables.has(variable) && !runtimeVariables.has(variable))
          report(declaration, 'registered-variable', `Unregistered CSS variable ${variable}.`);
        if (variable.startsWith('--ds-primitive-'))
          report(
            declaration,
            'semantic-token',
            'Component CSS must consume semantic/component tokens, not primitives.',
          );
      }
      if (
        node.type === 'function' &&
        /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)$/i.test(node.value)
      )
        report(declaration, 'color-token', 'Define literal colors in the token registry.');
      if (node.type !== 'word') return;
      const word = node.value.toLowerCase();
      if (
        /^#[\da-f]{3,8}$/i.test(word) ||
        (namedColors.has(word) && declaration.prop !== 'font-family')
      )
        report(declaration, 'color-token', 'Define literal colors in the token registry.');
      if (word.startsWith('--') || cssGlobals.has(word)) return;
      const numeric = valueParser.unit(word);
      if (!numeric || !Number.isFinite(Number(numeric.number))) return;
      const number = Number(numeric.number);
      if (number === 0) return;
      if (numeric.unit === 'fr') return;
      if (
        Math.abs(number) === 1 &&
        /^(?:em|rem|px|vw|vh|dvw|dvh)$/.test(numeric.unit) &&
        unitBases.has(node)
      )
        return;
      if (
        numeric.unit === '%' &&
        (percentageGeometry.has(declaration.prop) ||
          (declaration.prop === 'border-radius' && number === 50))
      )
        return;
      if (
        /^(?:dvh|dvw|svh|svw|lvh|lvw|vh|vw)$/.test(numeric.unit) &&
        [50, 100].includes(Math.abs(number))
      )
        return;
      if (
        numeric.unit === 'deg' &&
        declaration.prop === 'transform' &&
        [90, 180, 270, 360].includes(Math.abs(number))
      )
        return;
      if (
        !numeric.unit &&
        (structuralProperties.has(declaration.prop) ||
          (declaration.prop === 'opacity' && number === 1) ||
          (hasVariable && /(?:calc|min|max|clamp)\(/.test(declaration.value)))
      )
        return;
      report(
        declaration,
        'design-token',
        `Use a registered token for ${declaration.prop}: ${word}.`,
      );
    });
  });
  return diagnostics;
}

export function collectCssClasses(css: string): Set<string> {
  const result = new Set<string>();
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/.test((rule.parent as postcss.AtRule).name))
      return;
    selectorParser((selectors) => {
      selectors.walkClasses((item) => {
        result.add(item.value);
      });
    }).processSync(rule.selector);
  });
  root.walkAtRules('custom-variant', (rule) => {
    const start = rule.params.indexOf('(');
    if (start < 0 || !rule.params.endsWith(')')) return;
    selectorParser((selectors) => {
      selectors.walkClasses((item) => {
        result.add(item.value);
      });
    }).processSync(rule.params.slice(start + 1, -1));
  });
  return result;
}

export interface DesignCheckOptions {
  sources: DesignSource[];
  stylesheets: DesignSource[];
  theme: DesignSource;
  cssPolicy: CssPolicy;
  loadStylesheet?: NonNullable<Parameters<typeof compile>[1]>['loadStylesheet'];
}

export async function checkDesign(options: DesignCheckOptions): Promise<DesignDiagnostic[]> {
  const diagnostics: DesignDiagnostic[] = [];
  const classes: ClassUse[] = [];
  for (const source of options.sources) {
    try {
      classes.push(...analyzeSource(source, diagnostics));
    } catch (error) {
      diagnostics.push({
        path: source.path,
        line: 1,
        column: 1,
        rule: 'source-parse',
        message: error instanceof Error ? error.message : 'Cannot parse source.',
      });
    }
  }
  const defined = new Set<string>();
  for (const stylesheet of options.stylesheets) {
    for (const name of collectCssClasses(stylesheet.content)) defined.add(name);
    diagnostics.push(...checkCss(stylesheet, options.cssPolicy));
  }
  const compiler = await compile(options.theme.content, {
    base: dirname(options.theme.path),
    from: options.theme.path,
    loadStylesheet: options.loadStylesheet,
  });
  const generated = collectCssClasses(
    compiler.build([...new Set(classes.map((item) => item.value))]),
  );
  for (const use of classes) {
    const report = (rule: string, message: string) =>
      diagnostics.push({
        path: use.source.path,
        line: use.node.loc?.start.line ?? 1,
        column: (use.node.loc?.start.column ?? 0) + 1,
        rule,
        message,
      });
    // Source classes are checked separately: selectors may legitimately contain
    // punctuation, while Tailwind arbitrary values/variants must remain closed.
    if (/[[\]()]/.test(use.value))
      report(
        'named-utility',
        `Arbitrary values, properties, variants and variable shortcuts are prohibited: ${use.value}.`,
      );
    else if (
      /(?:^|:)opacity-/.test(use.value) ||
      (/\//.test(use.value) &&
        !/(?:^|:)(?:w|h|min-w|min-h|max-w|max-h|basis|translate-[xy]|inset|top|right|bottom|left)-\d+\/\d+$/.test(
          use.value,
        ))
    )
      report('effect-token', `Use a named state/effect token instead of a modifier: ${use.value}.`);
    else if (!defined.has(use.value) && !generated.has(use.value))
      report(
        'known-class',
        `Class is neither declared in project CSS nor generated by the current Tailwind theme: ${use.value}.`,
      );
  }
  return diagnostics.filter(
    (item, index, all) =>
      all.findIndex(
        (other) =>
          other.path === item.path &&
          other.line === item.line &&
          other.column === item.column &&
          other.rule === item.rule &&
          other.message === item.message,
      ) === index,
  );
}
