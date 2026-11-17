'use client';

import type * as React from 'react';
import { cn } from '@/lib/utils';
import {
  OverlayArrow,
  Tooltip as TooltipPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
} from 'react-aria-components';

// The trigger is a React Aria Button or another focusable React Aria control.
function TooltipTrigger({
  delay = 0,
  ...props
}: React.ComponentProps<typeof TooltipTriggerPrimitive>) {
  return <TooltipTriggerPrimitive delay={delay} {...props} />;
}

function Tooltip({
  className,
  placement = 'top',
  offset = 6,
  children,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive>, 'className' | 'children'> & {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <TooltipPrimitive
      data-ui="tooltip-content"
      placement={placement}
      offset={offset}
      className={cn('ds-tooltip', className)}
      {...props}
    >
      {children}
      <OverlayArrow className="ds-tooltip-arrow">
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
    </TooltipPrimitive>
  );
}

export { Tooltip, TooltipTrigger };
