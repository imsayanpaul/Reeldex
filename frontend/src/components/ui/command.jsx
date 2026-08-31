"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function Command({
  className,
  ...props
}) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#121518] text-[#f8fafa]",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0 max-w-2xl bg-[#121518] border border-[#282f34] shadow-2xl", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="bg-[#121518] **:data-[slot=command-input-wrapper]:h-13 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-400 [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]]:rounded-lg">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-13 items-center gap-3 border-b border-[#282f34] px-4 bg-[#121518]"
    >
      <SearchIcon className="size-4 shrink-0 text-zinc-400" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-11 w-full rounded-md bg-transparent py-2.5 text-sm text-[#f8fafa] outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[380px] scroll-py-1 overflow-x-hidden overflow-y-auto bg-[#121518] p-2",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  ...props
}) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-8 text-center text-sm text-zinc-400"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-[#f8fafa] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-zinc-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 my-1.5 h-px bg-[#282f34]", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none transition-colors select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 hover:bg-[#1e2328] hover:text-white data-[selected=true]:bg-[#1e2328] data-[selected=true]:text-white [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-zinc-500 font-mono",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
