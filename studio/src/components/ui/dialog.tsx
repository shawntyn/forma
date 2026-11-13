"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import {
  Dialog as DialogPrimitive,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  Text,
  type ModalOverlayProps,
} from "react-aria-components"
import { Button } from "@/components/ui/button"

// React Aria owns modal state, focus containment/restoration, outside dismissal,
// Escape and accessible slots. The ds-* recipes consume the shared theme.
type DialogProps = Omit<ModalOverlayProps, "className" | "children"> & {
  className?: string
  children: React.ReactNode
}

function Dialog({ className, isDismissable = true, ...props }: DialogProps) {
  return (
    <ModalOverlay
      data-ui="dialog-overlay"
      isDismissable={isDismissable}
      className={cn("ds-dialog-overlay", className)}
      {...props}
    />
  )
}

function DialogClose(props: React.ComponentProps<typeof Button>) {
  return <Button slot="close" data-ui="dialog-close" {...props} />
}

const DescriptionContext = React.createContext<((id: string) => () => void) | null>(null)

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive>, "children"> & {
  children?: React.ReactNode
  showCloseButton?: boolean
}) {
  const [descriptionIds, setDescriptionIds] = React.useState<string[]>([])
  const registerDescription = React.useCallback((id: string) => {
    setDescriptionIds(ids => ids.includes(id) ? ids : [...ids, id])
    return () => setDescriptionIds(ids => ids.filter(existing => existing !== id))
  }, [])
  return (
    <Modal
      data-ui="dialog-content"
      className={cn("ds-dialog-content", className)}
    >
      <DescriptionContext.Provider value={registerDescription}>
      <DialogPrimitive
        data-ui="dialog"
        className="ds-dialog"
        {...props}
        aria-describedby={props["aria-describedby"] ?? (descriptionIds.join(" ") || undefined)}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            variant="ghost"
            size="icon-sm"
            className="ds-dialog-dismiss"
            aria-label="关闭对话框"
          >
            <XIcon />
          </DialogClose>
        )}
      </DialogPrimitive>
      </DescriptionContext.Provider>
    </Modal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-ui="dialog-header" className={cn("ds-dialog-header", className)} {...props} />
}

function DialogFooter({ className, showCloseButton = false, children, ...props }: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  return (
    <div data-ui="dialog-footer" className={cn("ds-dialog-footer", className)} {...props}>
      {children}
      {showCloseButton && <DialogClose variant="outline">关闭</DialogClose>}
    </div>
  )
}

function DialogTitle({ className, ...props }: Omit<React.ComponentProps<typeof Heading>, "slot">) {
  return <Heading slot="title" data-ui="dialog-title" className={cn("ds-dialog-title", className)} {...props} />
}

function DialogDescription({ className, id: suppliedId, ...props }: Omit<React.ComponentProps<typeof Text>, "slot">) {
  const generatedId = React.useId()
  const id = suppliedId ?? generatedId
  const registerDescription = React.useContext(DescriptionContext)
  // RAC auto-links description slots only for alertdialog. Ordinary dialogs
  // explicitly link their short description while retaining native RAC slots.
  React.useEffect(() => registerDescription?.(id), [id, registerDescription])
  return <Text slot="description" elementType="p" data-ui="dialog-description" className={cn("ds-dialog-description", className)} {...props} id={id} />
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, type DialogProps }
