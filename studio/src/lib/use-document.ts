import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialDocument, parseDocument, STORAGE_KEY, type DesignDocument } from './document';

function loadDocument(): { document: DesignDocument; warning: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return {
      document: saved ? parseDocument(JSON.parse(saved)) : createInitialDocument(),
      warning: '',
    };
  } catch {
    return {
      document: createInitialDocument(),
      warning: '本地草稿无法读取，已载入示例。原始草稿保留在浏览器中，首次编辑后才会更新。',
    };
  }
}
export interface DocumentOptions {
  initialDocument?: DesignDocument;
  persist?: boolean;
  onChange?: (document: DesignDocument) => void;
}
export function useDocument(options: DocumentOptions = {}) {
  const persist = options.persist ?? true;
  const onChange = useRef(options.onChange);
  onChange.current = options.onChange;
  const [initial] = useState(() =>
    options.initialDocument
      ? { document: parseDocument(options.initialDocument), warning: '' }
      : loadDocument(),
  );
  const [document, setDocument] = useState(initial.document);
  const current = useRef(document);
  const past = useRef<DesignDocument[]>([]);
  const future = useRef<DesignDocument[]>([]);
  const [revision, setRevision] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [warning] = useState(initial.warning);
  const dirty = useRef(false);
  const commit = useCallback((next: DesignDocument | ((doc: DesignDocument) => DesignDocument)) => {
    const result = typeof next === 'function' ? next(current.current) : next;
    if (JSON.stringify(result) === JSON.stringify(current.current)) return;
    past.current = [...past.current.slice(-79), current.current];
    future.current = [];
    current.current = result;
    setDocument(result);
    setRevision((n) => n + 1);
    setSaveStatus('saving');
    dirty.current = true;
    onChange.current?.(result);
  }, []);
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    current.current = previous;
    setDocument(previous);
    setRevision((n) => n + 1);
    setSaveStatus('saving');
    dirty.current = true;
    onChange.current?.(previous);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    current.current = next;
    setDocument(next);
    setRevision((n) => n + 1);
    setSaveStatus('saving');
    dirty.current = true;
    onChange.current?.(next);
  }, []);
  useEffect(() => {
    if (revision === 0 || !persist) return;
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [document, revision, persist]);
  useEffect(() => {
    if (!persist) return;
    const flush = () => {
      if (dirty.current) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(current.current));
        } catch {
          /* normal save effect displays failure */
        }
      }
    };
    window.addEventListener('pagehide', flush);
    window.document.addEventListener('visibilitychange', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.document.removeEventListener('visibilitychange', flush);
    };
  }, [persist]);
  return {
    document,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    saveStatus,
    warning,
  };
}
