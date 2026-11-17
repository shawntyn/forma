import { afterEach, describe, expect, mock, test } from 'bun:test';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemePanel } from '../src/components/editor/ThemePanel';
import {
  createTheme,
  getTokenValue,
  getTokenReference,
  setTokenValue,
  hexToColor,
  colorToHex,
  themeToDTCG,
  type Theme,
  type DTCGColor,
} from '../src/lib/tokens';

afterEach(cleanup);

function Editor({
  initial = createTheme(),
  onChange,
}: {
  initial?: Theme;
  onChange: (theme: Theme) => void;
}) {
  const [theme, setTheme] = useState(initial);
  return (
    <ThemePanel
      theme={theme}
      onChange={(next) => {
        setTheme(next);
        onChange(next);
      }}
      onExportCSS={() => {}}
    />
  );
}

describe('global DTCG theme editor', () => {
  test('focusing and blurring values keeps aliases and full color precision intact', () => {
    const onChange = mock((_theme: Theme) => {});
    const initial = setTokenValue(createTheme(), 'primitive.color.brand', {
      colorSpace: 'srgb',
      components: [0.12345, 0.54321, 0.76543],
      alpha: 0.7,
    });
    render(<Editor initial={initial} onChange={onChange} />);
    const color = screen.getByRole('textbox', { name: /semantic.color.action$/ });
    fireEvent.focus(color);
    fireEvent.blur(color);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索主题 tokens' }), {
      target: { value: 'semantic.font.bodySize' },
    });
    const size = screen.getByRole('spinbutton', { name: /semantic.font.bodySize$/ });
    fireEvent.focus(size);
    fireEvent.blur(size);
    expect(onChange).not.toHaveBeenCalled();
    expect(getTokenReference(initial, 'semantic.color.action')).toBe('primitive.color.brand');
  });

  test('a palette applies non-color values atomically across alias constraints', async () => {
    const user = userEvent.setup({ document });
    const onChange = mock((_theme: Theme) => {});
    let initial = setTokenValue(createTheme(), 'semantic.font.bodySize', {
      value: 0.75,
      unit: 'rem',
    });
    initial = setTokenValue(initial, 'primitive.font.body', { value: 0.5, unit: 'rem' });
    render(<Editor initial={initial} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '应用森林绿主题' }));
    const next = onChange.mock.calls.at(-1)![0];
    expect(getTokenValue(next, 'primitive.font.body')).toEqual({ value: 0.5, unit: 'rem' });
    expect(getTokenValue(next, 'semantic.font.bodySize')).toEqual({ value: 0.75, unit: 'rem' });
    expect(getTokenReference(next, 'component.button.height')).toBe(
      getTokenReference(initial, 'component.button.height'),
    );
  });

  test('edits global semantic color and preserves the DTCG structure', async () => {
    const onChange = mock((_theme: Theme) => {});
    render(<Editor onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: /semantic.color.action$/ });
    fireEvent.change(field, { target: { value: '#119966' } });
    fireEvent.blur(field);
    const next = onChange.mock.calls.at(-1)![0];
    expect(next.version).toBe(2);
    expect(colorToHex(getTokenValue(next, 'semantic.color.action') as DTCGColor)).toBe('#119966');
    expect(getTokenReference(next, 'semantic.color.action')).toBeNull();
    expect(JSON.parse(themeToDTCG(next))).toHaveProperty('semantic.color.action.$type', 'color');
    expect(JSON.stringify(next.tokens)).not.toContain('"style"');
  });

  test('global size survives a color preset and invalid input cannot change the theme', async () => {
    const user = userEvent.setup({ document });
    const onChange = mock((_theme: Theme) => {});
    const initial = setTokenValue(createTheme(), 'semantic.font.bodySize', {
      value: 1.25,
      unit: 'rem',
    });
    render(<Editor initial={initial} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '应用森林绿主题' }));
    const next = onChange.mock.calls.at(-1)![0];
    expect(getTokenValue(next, 'semantic.font.bodySize')).toEqual({ value: 1.25, unit: 'rem' });
    expect(colorToHex(getTokenValue(next, 'semantic.color.action') as DTCGColor)).toBe('#188767');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索主题 tokens' }), {
      target: { value: 'semantic.font.bodySize' },
    });
    const field = screen.getByRole('spinbutton', { name: /semantic.font.bodySize$/ });
    const calls = onChange.mock.calls.length;
    fireEvent.change(field, { target: { value: '-1' } });
    fireEvent.blur(field);
    expect(onChange.mock.calls.length).toBe(calls);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(field, { target: { value: '1.5' } });
    fireEvent.blur(field);
    expect(getTokenValue(onChange.mock.calls.at(-1)![0], 'semantic.font.bodySize')).toEqual({
      value: 1.5,
      unit: 'rem',
    });
  });

  test('a semantic token can restore an alias and a component layer stays global', async () => {
    const user = userEvent.setup({ document });
    const initial = createTheme();
    const originalReference = getTokenReference(initial, 'semantic.color.action')!;
    const onChange = mock((_theme: Theme) => {});
    render(
      <Editor
        initial={setTokenValue(initial, 'semantic.color.action', hexToColor('#119966'))}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: /引用来源 semantic.color.action$/ }), {
      target: { value: originalReference },
    });
    expect(getTokenReference(onChange.mock.calls.at(-1)![0], 'semantic.color.action')).toBe(
      originalReference,
    );
    await user.click(screen.getByRole('button', { name: '组件' }));
    expect(screen.getByText('作用于全站的同类组件，不是单个页面或实例的样式。')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索主题 tokens' }), {
      target: { value: 'component.button.radius' },
    });
    const field = screen.getByRole('spinbutton', { name: /component.button.radius$/ });
    fireEvent.change(field, { target: { value: '1' } });
    fireEvent.blur(field);
    expect(getTokenValue(onChange.mock.calls.at(-1)![0], 'component.button.radius')).toEqual({
      value: 1,
      unit: 'rem',
    });
  });

  test('imports a token-only document and rejects unknown tokens without replacing the draft', async () => {
    const onChange = mock((_theme: Theme) => {});
    render(<Editor onChange={onChange} />);
    const field = screen.getByLabelText('导入 DTCG 文件');
    const next = setTokenValue(createTheme(), 'semantic.radius.surface', {
      value: 1.5,
      unit: 'rem',
    });
    const upload = (text: string) =>
      fireEvent.change(field, {
        target: { files: [{ size: text.length, text: async () => text }] },
      });
    upload(themeToDTCG(next));
    await waitFor(() => expect(onChange.mock.calls.length).toBe(1));
    expect(getTokenValue(onChange.mock.calls[0][0], 'semantic.radius.surface')).toEqual({
      value: 1.5,
      unit: 'rem',
    });
    const invalid = JSON.parse(themeToDTCG(next));
    invalid.instanceColor = { $type: 'color', $value: hexToColor('#ff0000') };
    upload(JSON.stringify(invalid));
    await screen.findByRole('alert');
    expect(onChange.mock.calls.length).toBe(1);
  });
});
