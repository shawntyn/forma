import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { Input, Label, TextField } from '../ui/input';

export function CmsField({ label, value, onChange, type = 'text', hint, maxLength, minLength, autoComplete, placeholder, isRequired = true }: {
  label: string; value: string; onChange: (value: string) => void; type?: 'text' | 'email' | 'password'; hint?: string; maxLength?: number;
  minLength?: number; autoComplete?: string; placeholder?: string; isRequired?: boolean;
}) {
  return <TextField className="cms-field" type={type} value={value} onChange={onChange} isRequired={isRequired}>
    <Label>{label}</Label>
    <Input maxLength={maxLength} minLength={minLength} autoComplete={autoComplete} placeholder={placeholder} />
    {hint && <small>{hint}</small>}
  </TextField>;
}
export function CmsNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`cms-notice ${error ? 'cms-notice-error' : ''}`} role={error ? 'alert' : 'status'}>{error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{children}</span></div>;
}
export function CmsLoading({ children = '正在加载…' }: { children?: ReactNode }) {
  return <div className="cms-loading" role="status"><LoaderCircle size={20} className="cms-spin" />{children}</div>;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。';
}
export function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
