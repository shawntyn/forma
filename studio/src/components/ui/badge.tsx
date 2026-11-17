import type * as React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
const variantClasses: Record<BadgeVariant, string> = {
  default: 'ds-badge--default',
  secondary: 'ds-badge--secondary',
  outline: 'ds-badge--outline',
  ghost: 'ds-badge--ghost',
  destructive: 'ds-badge--destructive',
  link: 'ds-badge--link',
};
function badgeVariants({
  variant = 'default',
  className,
}: {
  variant?: BadgeVariant;
  className?: string;
} = {}) {
  return cn('ds-badge', variantClasses[variant], className);
}

function Badge({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> & { variant?: BadgeVariant }) {
  return (
    <span
      data-ui="badge"
      data-variant={variant}
      className={badgeVariants({ variant, className })}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
