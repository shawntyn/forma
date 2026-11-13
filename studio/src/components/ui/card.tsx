import type * as React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-ui="card" className={cn('ds-card', className)} {...props} />;
}
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-ui="card-header" className={cn('ds-card-header', className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-ui="card-title" className={cn('ds-card-title', className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-ui="card-description" className={cn('ds-card-description', className)} {...props} />;
}
function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-ui="card-action" className={cn('ds-card-action', className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-ui="card-content" className={cn('ds-card-content', className)} {...props} />;
}
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-ui="card-footer" className={cn('ds-card-footer', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
