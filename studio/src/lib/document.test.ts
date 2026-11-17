import { describe, expect, test } from 'bun:test';
import {
  STORAGE_KEY,
  componentDefinitions,
  createInitialDocument,
  duplicateElement,
  findParent,
  getDescendants,
  insertElement,
  moveElement,
  parseDocument,
  removeElement,
  serializeDocument,
  updateElementProps,
} from './document';
import { createTheme, getTokenValue, parseTheme, themeToCSS, themeToStyle } from './tokens';
import legacyOrbit from '../../tests/fixtures/orbit-v1.forma.json';

describe('document integrity and editing', () => {
  test('serializes the seed as a valid, portable json-render spec', () => {
    const document = createInitialDocument();
    expect(parseDocument(serializeDocument(document))).toEqual(document);
    expect(document.spec.elements[document.spec.root].type).toBe('Page');
  });
  test('inserts into a chosen container without mutating the previous history entry', () => {
    const document = createInitialDocument();
    const snapshot = serializeDocument(document);
    const inserted = insertElement(document, 'Input', 'hero', 2);
    expect(findParent(inserted.document.spec, inserted.id)).toBe('hero');
    expect(inserted.document.spec.elements.hero.children![2]).toBe(inserted.id);
    expect(serializeDocument(document)).toBe(snapshot);
  });
  test('moves across parents and respects before-removal gap indices within a parent', () => {
    const document = createInitialDocument();
    const moved = moveElement(document, 'hero-badge', 'hero', 3);
    expect(moved.spec.elements.hero.children?.slice(0, 3)).toEqual([
      'hero-heading',
      'hero-description',
      'hero-badge',
    ]);
    const nested = moveElement(moved, 'hero-badge', 'feature-compose', 0);
    expect(findParent(nested.spec, 'hero-badge')).toBe('feature-compose');
    expect(nested.spec.elements.hero.children).not.toContain('hero-badge');
  });
  test('rejects cycles, root mutation, and children in leaf nodes', () => {
    const document = createInitialDocument();
    expect(() => moveElement(document, 'hero', 'hero-actions')).toThrow('自己的子组件');
    expect(() => moveElement(document, 'hero', 'hero')).toThrow('自己');
    expect(() => moveElement(document, 'page', 'hero')).toThrow('根节点');
    expect(() => removeElement(document, 'page')).toThrow('根节点');
    expect(() => insertElement(document, 'Text', 'hero-heading')).toThrow('布局容器');
  });
  test('duplicates complete subtrees with unique IDs and independent props', () => {
    const document = createInitialDocument();
    const cloned = duplicateElement(document, 'hero-actions');
    const children = cloned.document.spec.elements[cloned.id].children!;
    expect(children).toHaveLength(2);
    expect(children).not.toContain('hero-primary');
    expect(cloned.document.spec.elements[children[0]].props).toEqual(
      document.spec.elements['hero-primary'].props,
    );
    const edited = updateElementProps(cloned.document, children[0], { label: 'A new action' });
    expect(edited.spec.elements['hero-primary'].props.label).toBe('开始你的创作  ↗');
  });
  test('deletes a complete subtree without leaving dangling nodes', () => {
    const document = createInitialDocument();
    const removed = ['hero', ...getDescendants(document.spec, 'hero')];
    const next = removeElement(document, 'hero');
    for (const id of removed) expect(next.spec.elements[id]).toBeUndefined();
    expect(next.spec.elements.page.children).not.toContain('hero');
    expect(() => parseDocument(next)).not.toThrow();
  });
});

describe('import boundaries', () => {
  test('rejects instance-level visual overrides at both element and props level', () => {
    const document = createInitialDocument();
    expect(() => updateElementProps(document, 'hero-heading', { style: { color: 'red' } })).toThrow(
      'tokens',
    );
    expect(() =>
      updateElementProps(document, 'hero-primary', { className: 'rounded-none' }),
    ).toThrow('tokens');
    const injected = JSON.parse(serializeDocument(document));
    injected.spec.elements.hero.style = { background: 'red' };
    expect(() => parseDocument(injected)).toThrow('格式无效');
  });
  test('rejects scripting links and unregistered components', () => {
    const document = createInitialDocument();
    expect(() =>
      updateElementProps(document, 'hero-primary', { href: 'javascript:alert(1)' }),
    ).toThrow();
    const injected = JSON.parse(serializeDocument(document));
    injected.spec.elements['hero-heading'].type = 'script';
    expect(() => parseDocument(injected)).toThrow();
  });
  test('rejects dangling IDs, shared children, cycles and orphan nodes', () => {
    const dangling = createInitialDocument();
    dangling.spec.elements.hero.children!.push('missing');
    expect(() => parseDocument(dangling)).toThrow('找不到');
    const shared = createInitialDocument();
    shared.spec.elements.features.children!.push('hero-heading');
    expect(() => parseDocument(shared)).toThrow('一个位置');
    const cyclic = createInitialDocument();
    cyclic.spec.elements['hero-actions'].children!.push('hero');
    expect(() => parseDocument(cyclic)).toThrow('循环引用');
    const orphan = createInitialDocument();
    orphan.spec.elements.stray = { type: 'Text', props: { text: 'Unused', tone: 'default' } };
    expect(() => parseDocument(orphan)).toThrow('未连接');
  });
  test('rejects deeply nested documents before rendering', () => {
    const document = createInitialDocument();
    let parent = 'hero';
    for (let i = 0; i < 34; i++) {
      const id = `nest_${i}`;
      document.spec.elements[id] = {
        type: 'Stack',
        props: { direction: 'column', align: 'start' },
        children: [],
      };
      document.spec.elements[parent].children!.push(id);
      parent = id;
    }
    expect(() => parseDocument(document)).toThrow('32');
  });
  test('rejects extra theme tokens and CSS injection in allowed tokens', () => {
    const injected = JSON.parse(serializeDocument(createInitialDocument()));
    injected.theme.tokens['font-family'] = 'custom';
    expect(() => parseDocument(injected)).toThrow();
    delete injected.theme.tokens['font-family'];
    injected.theme.tokens.semantic.color.action.$value =
      'red; background: url(https://example.com)';
    expect(() => parseDocument(injected)).toThrow();
    const invalidRadius = JSON.parse(serializeDocument(createInitialDocument()));
    invalidRadius.theme.tokens.semantic.radius.control.$value = { value: 9, unit: 'rem' };
    expect(() => parseDocument(invalidRadius)).toThrow();
  });
});

describe('React Aria migration preserves the JSON boundary', () => {
  const deniedProps: [string, unknown][] = [
    ['style', { color: '#ff0000' }],
    ['className', 'bg-red-500 rounded-none'],
    ['UNSAFE_style', { '--ds-semantic-color-action': '#ff0000' }],
    ['UNSAFE_className', 'bg-red-500'],
    ['slot', 'custom-content'],
    ['themeOverride', { 'semantic.color.action': '#ff0000', 'semantic.radius.control': '0rem' }],
    ['render', { $function: '() => <div style={{color: "red"}} />' }],
    ['children', { $function: '({isPressed}) => isPressed ? "custom" : "default"' }],
    ['onPress', { $function: '() => document.body.remove()' }],
  ];

  test.each(deniedProps)(
    'rejects primitive escape hatch %s on every catalog component',
    (key, value) => {
      for (const definition of componentDefinitions) {
        const document = createInitialDocument();
        const subject = definition.type === 'Page' ? document.spec.root : 'subject';
        document.spec.elements = {
          [document.spec.root]: {
            type: 'Page',
            props: {},
            children: subject === document.spec.root ? [] : [subject],
          },
          ...(subject === document.spec.root
            ? {}
            : { [subject]: { type: definition.type, props: definition.defaultProps } }),
        };
        document.spec.elements[subject].props = {
          ...document.spec.elements[subject].props,
          [key]: value,
        };
        // Exercise the real serialized import path, not just an isolated schema.
        expect(() => parseDocument(JSON.stringify(document))).toThrow('tokens');
      }
    },
  );

  test('rejects serialized render props and expressions in otherwise allowed content fields', () => {
    const document = createInitialDocument();
    for (const value of [
      { $function: '({isHovered}) => "hovered"' },
      { $state: '/customStyles' },
    ]) {
      document.spec.elements['hero-primary'].props.label = value;
      expect(() => parseDocument(JSON.stringify(document))).toThrow('tokens');
    }
  });

  test('rejects moving styling hooks to the element envelope or theme token map', () => {
    const raw = JSON.parse(serializeDocument(createInitialDocument()));
    for (const [key, value] of deniedProps) {
      if (key === 'children') continue; // Element children is a validated ID list, not a primitive prop.
      const injected = structuredClone(raw);
      injected.spec.elements['hero-primary'][key] = value;
      expect(() => parseDocument(JSON.stringify(injected))).toThrow('格式无效');
    }
    for (const token of [
      '--ds-semantic-color-action',
      'customColor',
      'hover-action',
      'pressed-action',
      'UNSAFE_style',
      'font-family',
    ]) {
      const injected = structuredClone(raw);
      injected.theme.tokens[token] = '#ff0000';
      expect(() => parseDocument(JSON.stringify(injected))).toThrow('格式无效');
    }
  });

  test('round-trips the current Orbit v2 example', async () => {
    const text = await Bun.file(new URL('../../examples/orbit.forma.json', import.meta.url)).text();
    const original = JSON.parse(text);
    const restored = parseDocument(text);
    expect(original.version).toBe(2);
    expect(STORAGE_KEY).toBe('forma-studio-document-v1');
    expect(restored).toEqual(original);
    expect(JSON.parse(serializeDocument(restored))).toEqual(original);
    expect(parseDocument(serializeDocument(restored))).toEqual(restored);
  });

  test('migrates legacy v1 documents once while preserving content and existing local storage', () => {
    const original = structuredClone(legacyOrbit);
    original.theme.tokens.primary = '#123456';
    original.theme.tokens.radius = '1.25rem';
    const snapshot = JSON.stringify(original);
    const restored = parseDocument(snapshot);
    expect(restored.version).toBe(2);
    expect(restored.name).toBe(original.name);
    // The imported JSON fixture intentionally remains untrusted input with string
    // component names; compare the complete structures without casting it valid.
    expect<unknown>(restored.spec).toEqual(original.spec);
    expect(restored.theme).toEqual(parseTheme(original.theme));
    expect(restored.theme.version).toBe(2);
    expect(getTokenValue(restored.theme, 'semantic.color.action')).toMatchObject({
      colorSpace: 'srgb',
      components: [0x12 / 255, 0x34 / 255, 0x56 / 255],
    });
    expect(getTokenValue(restored.theme, 'semantic.radius.surface')).toEqual({
      value: 1.25,
      unit: 'rem',
    });
    expect(parseDocument(serializeDocument(restored))).toEqual(restored);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(STORAGE_KEY).toBe('forma-studio-document-v1');
  });

  test('v1 migration cannot bypass strict theme or instance boundaries, and v2 never accepts a legacy theme', () => {
    const legacy = structuredClone(legacyOrbit);
    expect(() => parseDocument({ ...legacy, version: 2 })).toThrow('格式无效');
    expect(() => parseDocument({ ...legacy, version: 3 })).toThrow('格式无效');
    expect(() =>
      parseDocument({ ...legacy, theme: { ...legacy.theme, css: 'body { color: red }' } }),
    ).toThrow('格式无效');
    legacy.theme.tokens.primary = 'url(https://example.test/style)';
    expect(() => parseDocument(legacy)).toThrow('格式无效');
    const styled = structuredClone(legacyOrbit);
    Object.assign(styled.spec.elements['hero-primary'].props, { style: { color: 'red' } });
    expect(() => parseDocument(styled)).toThrow('tokens');
  });
});

describe('global semantic tokens', () => {
  test('exports independent design system variables and preserves color mode', () => {
    const theme = createTheme('emerald', 'dark');
    expect(theme.version).toBe(2);
    expect(themeToStyle(theme)['--ds-semantic-color-action']).toBeTruthy();
    expect(themeToStyle(theme)['--ds-semantic-radius-surface']).toBeTruthy();
    expect(themeToStyle(theme)['--primary']).toBeUndefined();
    expect(themeToStyle(theme)['--radius']).toBeUndefined();
    expect(themeToCSS(theme)).toContain('.dark {');
    expect(themeToCSS(theme)).toContain('--ds-semantic-color-action:');
  });
});
