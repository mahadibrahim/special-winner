"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

type ConfirmOptions = {
  title?: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type Resolver = (value: boolean) => void

/**
 * Hook that returns a `confirm()` replacement backed by the shadcn AlertDialog.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirmDialog()
 *   ...
 *   const ok = await confirm({ description: 'Delete "Foo"?', destructive: true })
 *   if (!ok) return
 *   ...
 *   return (<>{dialog}{...}</>)
 */
export function useConfirmDialog() {
  const [open, setOpen] = React.useState(false)
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null)
  const resolverRef = React.useRef<Resolver | null>(null)

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const handleResolve = React.useCallback((value: boolean) => {
    setOpen(false)
    resolverRef.current?.(value)
    resolverRef.current = null
  }, [])

  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // If the dialog is being closed without an explicit action, treat as cancel.
        if (!next) handleResolve(false)
        else setOpen(true)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title ?? "Are you sure?"}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleResolve(false)}>
            {options?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleResolve(true)}
            className={cn(
              options?.destructive &&
                "bg-destructive text-cream hover:bg-destructive/90",
            )}
          >
            {options?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, dialog }
}
