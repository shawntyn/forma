import { Window } from 'happy-dom';

// Bun supplies the runner; Happy DOM supplies browser APIs for interaction tests.
// Keep Bun's own timer implementation so Testing Library does not require fake timers.
const browserWindow = new Window({ url: 'http://localhost:5173/' });
const browserGlobals = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement',
  'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLLabelElement',
  'HTMLFormElement', 'SVGElement', 'Document', 'DocumentFragment', 'Text', 'NodeFilter',
  'Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'FocusEvent',
  'InputEvent', 'TouchEvent', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'DOMException', 'DOMRect', 'CSS',
] as const;
for (const key of browserGlobals) {
  const value = key === 'window' ? browserWindow : browserWindow[key as keyof Window];
  if (value !== undefined) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
for (const key of ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: browserWindow[key].bind(browserWindow) });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });
