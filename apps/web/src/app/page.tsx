"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useCallback, useEffect, useState } from "react"
import { ChevronRight, Play } from "lucide-react"

import {
  TaskSummary,
  createTask,
  listTasks,
} from "@/lib/api"
import { statusBadgeClass } from "@/lib/status"
import { AppHeader } from "@/components/app-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"

function isActive(status: string) {
  return status === "queued" || status === "running"
}

function formatTime(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function shortUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "")
}

function activeCount(tasks: TaskSummary[]) {
  return tasks.filter((t) => isActive(t.status)).length
}

export default function Home() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const refreshTasks = useCallback(async () => {
    const { tasks: list } = await listTasks()
    setTasks(list)
  }, [])

  useEffect(() => {
    refreshTasks().catch((err) => setError(err.message))
    const interval = window.setInterval(() => {
      refreshTasks().catch((err) => setError(err.message))
    }, 2000)
    return () => window.clearInterval(interval)
  }, [refreshTasks])

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const created = await createTask(url)
      setUrl("")
      refreshTasks().catch(() => undefined)
      router.push(`/tasks/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task")
    } finally {
      setSubmitting(false)
    }
  }

  const queued = activeCount(tasks)

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff5f5_0%,#f2fbff_48%,#fff4fa_100%)] text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <AppHeader />

        <Card>
          <CardHeader>
            <CardTitle>Create new task</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitTask} className="space-y-3">
              <Label htmlFor="url">YouTube URL</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="sm:flex-1"
                />
                <Button type="submit" disabled={!url.trim() || submitting} className="sm:shrink-0">
                  <Play className="size-4" />
                  {submitting ? "Submitting" : "Create task"}
                </Button>
              </div>
              {queued > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {queued} task{queued > 1 ? "s" : ""} queued / running
                </p>
              ) : null}
            </form>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task history ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {tasks.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No tasks yet. Submit a YouTube URL above to start.
              </div>
            ) : (
              <ScrollArea className="max-h-[70dvh]">
                <ul className="flex flex-col">
                  {tasks.map((item) => (
                    <li key={item.id} className="border-b border-border/60 last:border-b-0">
                      <Link
                        href={`/tasks/${item.id}`}
                        className="flex w-full items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-left font-medium text-zinc-900">
                            {item.title || shortUrl(item.url)}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge className={statusBadgeClass(item.status)}>{item.status}</Badge>
                            <span>{formatTime(item.created_at)}</span>
                            {isActive(item.status) && item.current_stage ? (
                              <span>· {item.current_stage}</span>
                            ) : null}
                          </div>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
