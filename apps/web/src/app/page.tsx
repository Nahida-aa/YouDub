"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  Circle,
  Download,
  Eye,
  EyeOff,
  FileText,
  Play,
  RefreshCw,
  Settings,
  XCircle,
} from "lucide-react"

import {
  API_BASE,
  Task,
  TaskSummary,
  createTask,
  finalVideoDownloadUrl,
  finalVideoUrl,
  getCookieInfo,
  getOpenAIModels,
  getOpenAISettings,
  getTask,
  getYtdlpSettings,
  listTasks,
  saveCookie,
  saveOpenAISettings,
  saveYtdlpSettings,
} from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type SettingsForm = {
  cookie: string
  baseUrl: string
  apiKey: string
  model: string
  proxyPort: string
}

const SAVED_API_KEY_MASK = "********"
const SAVED_COOKIE_MASK = "******** saved YouTube cookie ********"

const defaultSettings: SettingsForm = {
  cookie: "",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  proxyPort: "",
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)))
}

function statusVariant(status?: string) {
  if (status === "succeeded") return "default"
  if (status === "failed") return "destructive"
  if (status === "running") return "secondary"
  return "outline"
}

function stageIcon(status: string) {
  if (status === "succeeded") return <CheckCircle2 className="size-4 text-[#00aeec]" />
  if (status === "failed") return <XCircle className="size-4 text-[#ff0033]" />
  if (status === "running") return <Circle className="size-4 fill-[#fb7299] text-[#fb7299]" />
  return <Circle className="size-4 text-muted-foreground" />
}

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

export default function Home() {
  const [url, setUrl] = useState("")
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(defaultSettings)
  const [settingsMessage, setSettingsMessage] = useState("")
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [cookieDirty, setCookieDirty] = useState(false)
  const [apiKeyDirty, setApiKeyDirty] = useState(false)

  const refreshTasks = useCallback(async () => {
    const { tasks: list } = await listTasks()
    setTasks(list)
    setSelectedId((current) => current ?? list[0]?.id ?? null)
  }, [])

  useEffect(() => {
    refreshTasks().catch((err) => setError(err.message))
    const interval = window.setInterval(() => {
      refreshTasks().catch((err) => setError(err.message))
    }, 2000)
    return () => window.clearInterval(interval)
  }, [refreshTasks])

  useEffect(() => {
    if (!selectedId) {
      setSelectedTask(null)
      return
    }
    let cancelled = false
    const load = () =>
      getTask(selectedId)
        .then((task) => {
          if (!cancelled) setSelectedTask(task)
        })
        .catch((err) => setError(err.message))
    load()
    const interval = window.setInterval(load, 2000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [selectedId])

  useEffect(() => {
    if (!settingsOpen) return
    Promise.all([getCookieInfo(), getOpenAISettings(), getYtdlpSettings()])
      .then(([cookie, openai, ytdlp]) => {
        setSettings({
          cookie: cookie.exists ? SAVED_COOKIE_MASK : "",
          baseUrl: openai.base_url,
          apiKey: openai.has_api_key ? openai.api_key || SAVED_API_KEY_MASK : "",
          model: openai.model,
          proxyPort: ytdlp.proxy_port,
        })
        setModelOptions(uniqueModels([openai.model]))
        setModelsLoaded(false)
        setShowApiKey(false)
        setCookieDirty(false)
        setApiKeyDirty(false)
        setSettingsMessage(openai.has_api_key ? "OpenAI key is saved." : "")
      })
      .catch((err) => setSettingsMessage(err.message))
  }, [settingsOpen])

  const progress = useMemo(() => {
    if (!selectedTask?.stages?.length) return 0
    const completed = selectedTask.stages.filter((stage) => stage.status === "succeeded").length
    return Math.round((completed / selectedTask.stages.length) * 100)
  }, [selectedTask])

  const anyActive = tasks.some((t) => isActive(t.status))

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const created = await createTask(url)
      setSelectedId(created.id)
      setSelectedTask(created)
      setUrl("")
      refreshTasks().catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task")
    } finally {
      setSubmitting(false)
    }
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSettingsMessage("")
    try {
      const cookie = cookieDirty ? await saveCookie(settings.cookie) : null
      const openai = await saveOpenAISettings({
        base_url: settings.baseUrl,
        api_key: apiKeyDirty ? settings.apiKey : "",
        model: settings.model,
      })
      const ytdlp = await saveYtdlpSettings({ proxy_port: settings.proxyPort })
      setSettingsMessage("Settings saved.")
      setSettings((current) => ({
        ...current,
        apiKey: openai.has_api_key ? openai.api_key || SAVED_API_KEY_MASK : "",
        cookie: cookieDirty ? (cookie?.exists ? SAVED_COOKIE_MASK : "") : current.cookie,
        proxyPort: ytdlp.proxy_port,
      }))
      setCookieDirty(false)
      setApiKeyDirty(false)
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Failed to save settings")
    }
  }

  async function fetchModels() {
    setSettingsMessage("")
    setModelsLoading(true)
    try {
      const response = await getOpenAIModels({
        base_url: settings.baseUrl,
        api_key: apiKeyDirty ? settings.apiKey : "",
      })
      const models = uniqueModels([settings.model, ...response.models])
      setModelOptions(models)
      setModelsLoaded(true)
      setSettings((current) => ({ ...current, model: current.model || models[0] || "" }))
      setSettingsMessage(models.length ? `${models.length} models loaded.` : "No models returned.")
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Failed to load models")
    } finally {
      setModelsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff5f5_0%,#f2fbff_48%,#fff4fa_100%)] text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[#00aeec]/25 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#ff0033]">YouDub</p>
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-950 sm:text-3xl">
              YouTube Chinese dubbing
            </h1>
          </div>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              <Settings className="size-4" />
              Settings
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-2xl">
              <form onSubmit={submitSettings} className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
                <DialogHeader className="shrink-0 pr-8">
                  <DialogTitle>Runtime settings</DialogTitle>
                  <DialogDescription>
                    Stored locally by the FastAPI backend.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 min-h-0 overflow-y-auto pr-1">
                  <div className="grid gap-4 pb-4">
                    <div className="grid gap-2">
                      <Label htmlFor="cookie">YouTube cookie</Label>
                      <Textarea
                        id="cookie"
                        value={settings.cookie}
                        onFocus={(event) => {
                          if (!cookieDirty && settings.cookie === SAVED_COOKIE_MASK) {
                            event.currentTarget.select()
                          }
                        }}
                        onChange={(event) => {
                          setCookieDirty(true)
                          setSettings((current) => ({
                            ...current,
                            cookie: event.target.value.replace(SAVED_COOKIE_MASK, ""),
                          }))
                        }}
                        placeholder="Paste Netscape cookie content"
                        className="min-h-44 max-h-[42dvh] overflow-auto font-mono text-xs leading-relaxed"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="proxyPort">yt-dlp proxy port</Label>
                      <Input
                        id="proxyPort"
                        inputMode="numeric"
                        value={settings.proxyPort}
                        onChange={(event) =>
                          setSettings((current) => ({ ...current, proxyPort: event.target.value }))
                        }
                        placeholder="7890"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="baseUrl">OpenAI base URL</Label>
                      <Input
                        id="baseUrl"
                        value={settings.baseUrl}
                        onChange={(event) =>
                          setSettings((current) => ({ ...current, baseUrl: event.target.value }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="apiKey">OpenAI API key</Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          type={showApiKey ? "text" : "password"}
                          value={settings.apiKey}
                          onFocus={(event) => {
                            if (!apiKeyDirty && settings.apiKey === SAVED_API_KEY_MASK) {
                              event.currentTarget.select()
                            }
                          }}
                          onChange={(event) => {
                            setApiKeyDirty(true)
                            setSettings((current) => ({
                              ...current,
                              apiKey: event.target.value.replace(SAVED_API_KEY_MASK, ""),
                            }))
                          }}
                          placeholder="Leave blank to keep existing key"
                          className="pr-9"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="absolute top-0.5 right-0.5"
                          onClick={() => setShowApiKey((current) => !current)}
                        >
                          {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          <span className="sr-only">{showApiKey ? "Hide API key" : "Show API key"}</span>
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <div className="grid gap-2">
                        <Label htmlFor="model">Model</Label>
                        {modelsLoaded && modelOptions.length > 0 ? (
                          <Select
                            value={settings.model}
                            onValueChange={(value) =>
                              setSettings((current) => ({ ...current, model: value || "" }))
                            }
                          >
                            <SelectTrigger id="model">
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                              {modelOptions.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id="model"
                            value={settings.model}
                            onChange={(event) =>
                              setSettings((current) => ({ ...current, model: event.target.value }))
                            }
                          />
                        )}
                      </div>
                      <div className="grid gap-2 sm:self-end">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={fetchModels}
                          disabled={modelsLoading || !settings.baseUrl.trim()}
                        >
                          <RefreshCw className="size-4" />
                          {modelsLoading ? "Loading" : "Get models"}
                        </Button>
                      </div>
                    </div>
                    {settingsMessage ? (
                      <p className="text-sm text-muted-foreground">{settingsMessage}</p>
                    ) : null}
                  </div>
                </div>
                <DialogFooter className="shrink-0">
                  <Button type="submit">Save settings</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Convert video</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitTask} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="url">YouTube URL</Label>
                <Input
                  id="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={anyActive}
                />
              </div>
              <Button type="submit" disabled={!url.trim() || submitting || anyActive}>
                <Play className="size-4" />
                {anyActive ? "Task running" : submitting ? "Submitting" : "Start conversion"}
              </Button>
            </form>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <Separator className="my-5" />

            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Backend</span>
                <code className="rounded bg-muted px-2 py-1 text-xs">{API_BASE}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mode</span>
                <Badge variant="outline">Single task, serial stages</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="lg:sticky lg:top-6 lg:self-start">
            <CardHeader>
              <CardTitle>History ({tasks.length})</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {tasks.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No task yet.
                </div>
              ) : (
                <ScrollArea className="max-h-[60dvh]">
                  <ul className="flex flex-col">
                    {tasks.map((item) => {
                      const active = item.id === selectedId
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={`flex w-full flex-col gap-1 border-l-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60 ${
                              active
                                ? "border-l-[#fb7299] bg-muted/40"
                                : "border-l-transparent"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatTime(item.created_at)}
                              </span>
                            </div>
                            <p className="truncate text-xs text-zinc-700">{shortUrl(item.url)}</p>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Progress</CardTitle>
                <Badge variant={statusVariant(selectedTask?.status)}>
                  {selectedTask?.status || "idle"}
                </Badge>
              </div>
              <Progress value={progress} />
            </CardHeader>
            <CardContent>
              {selectedTask ? (
                <div className="space-y-4">
                  <div className="grid gap-1 text-sm">
                    <p className="break-all font-medium">{selectedTask.url}</p>
                    {selectedTask.session_path ? (
                      <p className="break-all text-muted-foreground">{selectedTask.session_path}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    {selectedTask.stages.map((stage) => (
                      <div
                        key={stage.name}
                        className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3"
                      >
                        <div className="mt-0.5">{stageIcon(stage.status)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{stage.label}</p>
                            <Badge variant={statusVariant(stage.status)}>{stage.status}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {stage.error_message || stage.last_message || "Waiting"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedTask.error_message ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {selectedTask.error_message}
                    </div>
                  ) : null}

                  {selectedTask.status === "succeeded" && selectedTask.final_video_path ? (
                    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="break-all text-sm text-emerald-900">
                        {selectedTask.final_video_path}
                      </p>
                      <video
                        key={selectedTask.id}
                        src={finalVideoUrl(selectedTask.id)}
                        controls
                        preload="metadata"
                        className="w-full rounded-md border border-emerald-200 bg-black"
                      />
                      <Button render={<a href={finalVideoDownloadUrl(selectedTask.id)} />}>
                        <Download className="size-4" />
                        Download final video
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  Select a task to see details.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Task log</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40 rounded-lg border bg-zinc-950 p-3 text-xs text-zinc-100">
              {selectedTask ? (
                <pre className="whitespace-pre-wrap break-words">
                  {selectedTask.stages
                    .map((stage) => `[${stage.name}] ${stage.error_message || stage.last_message || stage.status}`)
                    .join("\n")}
                </pre>
              ) : (
                <p className="text-zinc-400">Logs appear after a task is submitted.</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
