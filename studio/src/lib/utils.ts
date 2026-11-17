import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { TAILWIND_THEME_NAMES } from './style-tokens';

// The merger must recognize the same named scales as the generated stylesheet.
// In particular, text-body is typography while text-muted is a color.
const mergeClasses = extendTailwindMerge({ extend: { theme: TAILWIND_THEME_NAMES } });
export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs));
}
