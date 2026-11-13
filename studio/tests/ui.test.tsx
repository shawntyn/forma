import { afterEach, describe, expect, mock, test } from 'bun:test';
import { useState, type CSSProperties } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../src/components/ui/dialog';
import { CanvasRenderer } from '../src/components/editor/CanvasRenderer';
import { createInitialDocument, insertElement, parseDocument } from '../src/lib/document';
import { themeToStyle, setTokenValue, hexToColor } from '../src/lib/tokens';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function ExportDialogExample() {
  const [isOpen, setIsOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setIsOpen(true)}>打开导出</button>
    <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogTitle>导出设计项目</DialogTitle>
        <DialogDescription>下载页面结构与全局主题。</DialogDescription>
        <Button onPress={() => setIsOpen(false)}>完成</Button>
      </DialogContent>
    </Dialog>
  </>;
}

describe('React Aria UI interactions', () => {
  test('buttons support keyboard activation and disabled buttons do not press', async () => {
    const user = userEvent.setup({ document });
    const onPress = mock(() => {});
    const onDisabledPress = mock(() => {});
    render(<><Button onPress={onPress}>添加组件</Button><Button isDisabled onPress={onDisabledPress}>不可用操作</Button></>);

    await user.tab();
    expect(document.activeElement === screen.getByRole('button', { name: '添加组件' })).toBe(true);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onPress).toHaveBeenCalledTimes(2);
    const disabled = screen.getByRole('button', { name: '不可用操作' }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    await user.click(disabled);
    expect(onDisabledPress).toHaveBeenCalledTimes(0);
  });

  test('dialog exposes its title and description, closes with Escape and restores focus', async () => {
    const user = userEvent.setup({ document });
    render(<ExportDialogExample />);
    const opener = screen.getByRole('button', { name: '打开导出' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: '导出设计项目', description: '下载页面结构与全局主题。' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement === opener).toBe(true));

    // App opens dialogs from ordinary toolbar buttons as well as RAC buttons.
    // Reopen and verify the visible RAC slot=close button changes controlled state.
    await user.click(opener);
    await user.click(await screen.findByRole('button', { name: '关闭对话框' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement === opener).toBe(true));
  });

  test('modal keyboard focus wraps forward within the dialog', async () => {
    const user = userEvent.setup({ document });
    render(<ExportDialogExample />);
    await user.click(screen.getByRole('button', { name: '打开导出' }));
    const dialog = await screen.findByRole('dialog', { name: '导出设计项目' });
    const first = within(dialog).getByRole('button', { name: '完成' });
    const last = within(dialog).getByRole('button', { name: '关闭对话框' });
    await waitFor(() => expect(document.activeElement === dialog).toBe(true));
    await user.tab();
    expect(document.activeElement === first).toBe(true);
    await user.tab();
    expect(document.activeElement === last).toBe(true);
    await user.tab();
    expect(document.activeElement === first).toBe(true);
    // Reverse Shift+Tab must also be verified in a real browser: Happy DOM's
    // focus traversal keeps focus on the first element in this setup.
  });
});

describe('json-render canvas integration', () => {
  test('editor clicks select a link component without navigating away', async () => {
    const user = userEvent.setup({ document });
    const doc = createInitialDocument();
    const onSelect = mock((_id: string) => {});
    render(<CanvasRenderer spec={doc.spec} selectedId={null} preview={false} onSelect={onSelect} />);
    const link = screen.getByRole('link', { name: /开始你的创作/ });
    await user.click(link);
    expect(onSelect).toHaveBeenCalledWith('hero-primary');
    expect(window.location.hash).toBe('');
    // The DOM's canceled return value verifies actual navigation prevention,
    // independently of Happy DOM's simplified location/default-action handling.
    expect(fireEvent.click(link)).toBe(false);
    expect(onSelect).toHaveBeenCalledWith('hero-primary');
    expect(window.location.hash).toBe('');
  });

  test('preview retains real link semantics and an accessible editable text field', async () => {
    const user = userEvent.setup({ document });
    const doc = insertElement(createInitialDocument(), 'Input', 'page').document;
    const onSelect = mock((_id: string) => {});
    render(<CanvasRenderer spec={doc.spec} selectedId={null} preview onSelect={onSelect} />);
    const link = screen.getByRole('link', { name: /开始你的创作/ });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#features');
    expect(fireEvent.click(link)).toBe(true);
    const field = screen.getByRole('textbox', { name: '邮箱地址' }) as HTMLInputElement;
    expect(field.type).toBe('email');
    await user.type(field, 'hello@example.com');
    expect(field.value).toBe('hello@example.com');
    expect(onSelect).toHaveBeenCalledTimes(0);
  });

  test('page content renders unchanged and global semantic tokens stay outside component props', () => {
    // This uses the existing persisted format, not React Aria-specific component props.
    const doc = parseDocument(JSON.parse(JSON.stringify(createInitialDocument())));
    const original = JSON.stringify(doc);
    const noop = () => {};
    const view = (primary: string) => <div data-testid="theme-scope" style={themeToStyle(setTokenValue(doc.theme, 'semantic.color.action', hexToColor(primary))) as CSSProperties}>
      <CanvasRenderer spec={doc.spec} selectedId={null} preview onSelect={noop} />
    </div>;
    const { rerender } = render(view('#7655d9'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('把想法，变成\n下一件作品。');
    expect(screen.getByTestId('theme-scope').style.getPropertyValue('--ds-semantic-color-action')).toBe('#7655d9');
    rerender(view('#188767'));
    expect(screen.getByTestId('theme-scope').style.getPropertyValue('--ds-semantic-color-action')).toBe('#188767');
    expect(JSON.stringify(doc)).toBe(original);
    for (const element of Object.values(doc.spec.elements)) {
      expect(Object.hasOwn(element.props, 'style')).toBe(false);
      expect(Object.hasOwn(element.props, 'className')).toBe(false);
      expect(Object.hasOwn(element.props, 'onPress')).toBe(false);
    }
  });
});
