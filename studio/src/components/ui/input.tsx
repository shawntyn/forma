import type * as React from 'react';
import { composeRenderProps, Input as AriaInput, TextField, Label } from 'react-aria-components';
import { cn } from '@/lib/utils';

function Input({ className, ...props }: React.ComponentProps<typeof AriaInput>) {
  return <AriaInput data-ui="input" className={composeRenderProps(className, value => cn('ds-input', value))} {...props} />;
}

export { Input, TextField, Label };
