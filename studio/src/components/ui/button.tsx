import type * as React from 'react';
import { Button as AriaButton, Link as AriaLink } from 'react-aria-components';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
type ButtonAppearance = { variant?: ButtonVariant; size?: ButtonSize; className?: string };

// Appearance is a fixed design-system recipe. The page catalog never exposes
// class names, CSS declarations, or React Aria render functions to saved JSON.
function buttonVariants({ variant = 'default', size = 'default', className }: ButtonAppearance = {}) {
  return cn('ds-button', `ds-button--${variant}`, `ds-button-size--${size}`, className);
}

type ButtonProps = Omit<React.ComponentProps<typeof AriaButton>, 'className'> & ButtonAppearance;
type ButtonLinkProps = Omit<React.ComponentProps<typeof AriaLink>, 'className'> & ButtonAppearance;

function Button({ className, variant = 'default', size = 'default', ...props }: ButtonProps) {
  return <AriaButton data-ui="button" data-variant={variant} data-size={size} className={buttonVariants({ variant, size, className })} {...props} />;
}

function ButtonLink({ className, variant = 'default', size = 'default', ...props }: ButtonLinkProps) {
  return <AriaLink data-ui="button" data-variant={variant} data-size={size} className={buttonVariants({ variant, size, className })} {...props} />;
}

export { Button, ButtonLink, buttonVariants, type ButtonProps, type ButtonLinkProps };
