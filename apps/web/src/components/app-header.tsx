"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SettingsDialog } from "@/components/settings-dialog"

export function AppHeader({ backHref }: { backHref?: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-[#00aeec]/25 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {backHref ? (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={<Link href={backHref} aria-label="Back" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <Link href="/" className="flex flex-col">
          <span className="text-sm font-medium text-[#ff0033]">YouDub</span>
          <span className="text-2xl font-semibold tracking-normal text-zinc-950 sm:text-3xl">
            YouTube Chinese dubbing
          </span>
        </Link>
      </div>
      <SettingsDialog />
    </header>
  )
}
