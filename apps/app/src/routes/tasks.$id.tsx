import { createFileRoute, useParams, useNavigate, Link } from '@tanstack/solid-router';
import { createSignal, createMemo, For, Show } from 'solid-js';
import { createQuery } from '@tanstack/solid-query';
import { ArrowLeft, Download, Play, RotateCcw, Trash2, AlertTriangle, CheckCircle2, Loader2, Clock, XCircle, Languages } from 'lucide-solid';
import { Button } from '@repo/ui-solid/base/button';
import { Badge } from '@repo/ui-solid/base/badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@repo/ui-solid/base/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@repo/ui-solid/base/dialog';
import type { TaskStage } from '../lib/api';
import { getTask, getTaskLog, deleteTask, resumeTask, rerunStage, finalVideoUrl, finalVideoDownloadUrl, getTaskDescription, translateTaskDescription } from '../lib/api';

export const Route = createFileRoute('/tasks/$id')({
	component: TaskDetail,
});

const STAGE_ORDER = ['download', 'separate', 'asr', 'asr_fix', 'translate', 'split_audio', 'tts', 'merge_audio', 'merge_video'];

function stageLabel(name: string): string {
	const map: Record<string, string> = {
		download: '下载视频(yt-dlp)',
		separate: '人声分离(demucs/htdemucs_ft)',
		asr: '语音识别(whisper_asr.py/whisper/large-v3-turbo)',
		asr_fix: '句子修正(asr_sentence_fixer.py/纯规则无模型)',
		translate: '翻译字幕(openai_translate.py/openai兼容api,如gpt-4o-mini)',
		split_audio: '切分音频(audio.py/librosa + pydub（DSP 无模型）)',
		tts: '语音合成(tts, voxcp.py/OpenBMB,VoxCPM2)',
		merge_audio: '合成音频(audio.py/librosa + audiostretchy（DSP 无模型）)',
		merge_video: '合成视频(ffmpeg.py)',
	};
	return map[name] ?? name;
}

function stageIcon(status: string) {
	switch (status) {
		case 'succeeded': return CheckCircle2;
		case 'failed': return XCircle;
		case 'running': return Loader2;
		case 'queued': return Clock;
		default: return Clock;
	}
}

function stageIconClass(status: string): string {
	switch (status) {
		case 'succeeded': return 'text-green-500';
		case 'failed': return 'text-red-500';
		case 'running': return 'text-blue-500 animate-spin';
		default: return 'text-muted-foreground';
	}
}

function stageBadgeClass(status: string): string {
	switch (status) {
		case 'succeeded': return 'bg-green-500/10 text-green-600 border-green-200';
		case 'failed': return 'bg-red-500/10 text-red-600 border-red-200';
		case 'running': return 'bg-blue-500/10 text-blue-600 border-blue-200';
		case 'queued': return 'bg-amber-500/10 text-amber-600 border-amber-200';
		default: return 'bg-muted text-muted-foreground';
	}
}

function statusLabel(status: string): string {
	const map: Record<string, string> = {
		succeeded: '成功',
		failed: '失败',
		running: '运行中',
		queued: '排队中',
		pending: '等待中',
	};
	return map[status] ?? status;
}

function formatTime(value: string | null): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function formatDuration(start: string | null, end: string | null): string {
	if (!start || !end) return '';
	const ms = new Date(end).getTime() - new Date(start).getTime();
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${Math.round(ms / 1000)}s`;
	const m = Math.floor(ms / 60000);
	const s = Math.round((ms % 60000) / 1000);
	return `${m}m ${s}s`;
}

function progressPercent(stages: TaskStage[]): number {
	if (!stages.length) return 0;
	const completed = stages.filter((s) => s.status === 'succeeded').length;
	return Math.round((completed / stages.length) * 100);
}

import { m } from "@repo/shared/i18n/paraglide/messages";

function TaskDetail() {
	const params = useParams({ from: '/tasks/$id' });
	const navigate = useNavigate();

	const taskQuery = createQuery(() => ({
		queryKey: ['task', params().id],
		queryFn: () => getTask(params().id),
		// staleTime: 2000,
		refetchInterval: 2000,
	}));
	const task = () => taskQuery.data;

	const logQuery = createQuery(() => ({
		queryKey: ['taskLog', params().id],
		queryFn: async () => {
			try {
				return await getTaskLog(params().id) || '';
			} catch {
				console.log('Failed to fetch log for task', params().id);
				return ''; // Ignore log fetch errors
			}
		},
		refetchInterval: 2000,
	}));
	const log = () => logQuery.data || '';

	const descQuery = createQuery(() => ({
		queryKey: ['taskDesc', params().id],
		queryFn: () => getTaskDescription(params().id),
		refetchInterval: 2000,
	}));
	const description = () => descQuery.data;

	const error = () => (taskQuery.error as Error)?.message || '';
	const [deleting, setDeleting] = createSignal(false);
	const [resuming, setResuming] = createSignal(false);
	const [stageRerunning, setStageRerunning] = createSignal<string | null>(null);
	const [translatingDesc, setTranslatingDesc] = createSignal(false);

	async function handleTranslateDesc() {
		setTranslatingDesc(true);
		try {
			await translateTaskDescription(params().id);
			taskQuery.refetch();
		} catch (err) {
			alert(err instanceof Error ? err.message : '翻译简介失败');
		} finally {
			setTranslatingDesc(false);
		}
	}

	async function handleDelete() {
		setDeleting(true);
		try {
			await deleteTask(params().id);
			navigate({ to: '/' });
		} catch (err) {
			alert(err instanceof Error ? err.message : '删除失败');
		} finally {
			setDeleting(false);
		}
	}

	async function handleResume() {
		setResuming(true);
		try {
			await resumeTask(params().id);
			taskQuery.refetch();
		} catch (err) {
			alert(err instanceof Error ? err.message : '恢复失败');
		} finally {
			setResuming(false);
		}
	}

	async function handleRerunStage(stage: string) {
		setStageRerunning(stage);
		try {
			await rerunStage(params().id, stage, false);
			taskQuery.refetch();
		} catch (err) {
			alert(err instanceof Error ? err.message : '重跑失败');
		} finally {
			setStageRerunning(null);
		}
	}

	const stages = createMemo(() => {
		const t = task();
		if (!t?.stages) return [];
		return [...t.stages].sort(
			(a, b) => STAGE_ORDER.indexOf(a.name) - STAGE_ORDER.indexOf(b.name),
		);
	});

	const isRunning = () => task()?.status === 'running';
	const isFailed = () => task()?.status === 'failed';
	const isCompleted = () => task()?.status === 'succeeded';
	const canRerunStage = (status: string) =>
		status === 'succeeded' || status === 'failed';
	const logLines = () => log().split('\n').filter(Boolean);

	return (
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
			{/* Header */}
			<div class="flex items-center gap-3">
				<Link to="/" class="text-muted-foreground hover:text-foreground transition-colors">
					<ArrowLeft class="size-5" />
				</Link>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-lg font-semibold">
						{task()?.title || task()?.url?.replace(/^https?:\/\/(www\.)?/, '') || '加载中...'}
					</h1>
				</div>
				<Show when={task()}>
					<Badge class={stageBadgeClass(task()!.status)}>
						{statusLabel(task()!.status)}
					</Badge>
				</Show>
			</div>

			<Show when={error()}>
				<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					{error()}
				</div>
			</Show>

			<Show when={task()}>
				{/* Progress */}
				<Card class=''>
					<CardContent class="pt-4">
						<div class="flex items-center gap-3">
							<div class="flex-1">
								<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full bg-green-500 transition-all duration-500"
										style={{ width: `${progressPercent(task()!.stages)}%` }}
									/>
								</div>
							</div>
							<span class="text-sm text-muted-foreground">
								{progressPercent(task()!.stages)}%
							</span>
						</div>
						<Show when={task()!.current_stage && isRunning()}>
							<p class="mt-1 text-xs text-muted-foreground">
								当前：{stageLabel(task()!.current_stage!)}
							</p>
						</Show>
					</CardContent>
				</Card>

				{/* Task Info */}
				<Card class="bg-card">
					<CardHeader>
						<CardTitle>任务信息</CardTitle>
					</CardHeader>
					<CardContent class="space-y-1 text-sm">
						<div class="flex gap-2">
							<span class="text-muted-foreground w-20 shrink-0">ID</span>
							<span class="font-mono text-xs">{task()!.id}</span>
						</div>
						<div class="flex gap-2">
							<span class="text-muted-foreground w-20 shrink-0">链接</span>
							<span class="truncate">{task()!.url}</span>
						</div>
						<div class="flex gap-2">
							<span class="text-muted-foreground w-20 shrink-0">创建时间</span>
							<span>{formatTime(task()!.created_at)}</span>
						</div>
						<Show when={task()!.started_at}>
							<div class="flex gap-2">
								<span class="text-muted-foreground w-20 shrink-0">开始时间</span>
								<span>{formatTime(task()!.started_at)}</span>
							</div>
						</Show>
						<Show when={task()!.completed_at}>
							<div class="flex gap-2">
								<span class="text-muted-foreground w-20 shrink-0">完成时间</span>
								<span>{formatTime(task()!.completed_at)}</span>
							</div>
						</Show>
						<Show when={task()!.session_path}>
							<div class="flex gap-2">
								<span class="text-muted-foreground w-20 shrink-0">路径</span>
								<span class="font-mono text-xs truncate">{task()!.session_path}</span>
							</div>
						</Show>
						<Show when={isFailed() && task()!.error_message}>
							<div class="flex gap-2">
								<span class="text-muted-foreground w-20 shrink-0">错误</span>
								<span class="text-red-600">{task()!.error_message}</span>
							</div>
						</Show>
					</CardContent>
				</Card>

				{/* Description */}
				<Show when={description()?.src}>
					<Card>
						<CardHeader>
							<CardTitle>视频简介</CardTitle>
						</CardHeader>
						<CardContent class="space-y-3 text-sm">
							<div class="rounded-lg bg-muted/50 p-3">
								<p class="mb-1 text-xs font-medium text-muted-foreground">原文</p>
								<p class="whitespace-pre-wrap break-words">{description()!.src}</p>
							</div>
							<div class="rounded-lg bg-muted/50 p-3">
								<p class="mb-1 text-xs font-medium text-muted-foreground">中文</p>
								<p class="whitespace-pre-wrap break-words">{description()!.dst}</p>
							</div>
						</CardContent>
					</Card>
				</Show>

				{/* Pipeline Stages */}
				<Card>
					<CardHeader>
						<CardTitle>处理流程</CardTitle>
						<CardDescription>
							点击单个节点可单独重跑该步骤
						</CardDescription>
					</CardHeader>
					<CardContent class="px-0">
						<ul class="flex flex-col">
							<For each={stages()}>
								{(stage, index) => {
									const Icon = stageIcon(stage.status);
									return (
										<li class="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
											{/* Connector line */}
											<div class="flex flex-col items-center">
												<div class="flex h-8 w-8 items-center justify-center">
													<Icon class={`size-4 ${stageIconClass(stage.status)}`} />
												</div>
												<Show when={index() < stages().length - 1}>
													<div class="h-full w-px bg-border" />
												</Show>
											</div>
											{/* Content */}
											<div class="flex-1 min-w-0">
												<div class="flex items-center gap-2">
													<span class="text-xs text-muted-foreground">#{index() + 1}</span>
													<span class="text-sm font-medium">{stageLabel(stage.name)}</span>
													<Badge class={stageBadgeClass(stage.status)}>
														{statusLabel(stage.status)}
													</Badge>
												</div>
												<div class="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
													<Show when={stage.started_at}>
														<span>{formatTime(stage.started_at)}</span>
													</Show>
													<Show when={stage.completed_at}>
														<span>· {formatDuration(stage.started_at, stage.completed_at)}</span>
													</Show>
													<Show when={stage.last_message}>
														<span>· {stage.last_message}</span>
													</Show>
												</div>
											</div>
											{/* Rerun button */}
											<Show when={canRerunStage(stage.status)}>
												<Button
													variant="ghost"
													size="icon-xs"
													disabled={stageRerunning() === stage.name}
													onClick={() => handleRerunStage(stage.name)}
													title="重跑此步骤"
												>
													<Show
														when={stageRerunning() === stage.name}
														fallback={<RotateCcw class="size-3.5" />}
													>
														<Loader2 class="size-3.5 animate-spin" />
													</Show>
												</Button>
											</Show>
										</li>
									);
								}}
							</For>
						</ul>
					</CardContent>
				</Card>

				{/* Video Player */}
				<Show when={isCompleted() && task()!.final_video_path}>
					<Card>
						<CardHeader>
							<CardTitle>最终视频</CardTitle>
						</CardHeader>
						<CardContent>
							<video
								controls
								class="w-full max-h-[70dvh] rounded-lg"
								src={finalVideoUrl(params().id)}
								preload="metadata"
							>
							</video>
							 <p class="break-all text-xs text-muted-foreground">{task()?.final_video_path}</p>
						</CardContent>
						<CardFooter class="flex gap-2">
							<a
								href={finalVideoDownloadUrl(params().id)}
								download={task()?.title || 'video'}
							>
								<Button variant="outline" size="sm">
									<Download class="size-4" />
									下载视频
								</Button>
							</a>
							<Button
								variant="outline"
								size="sm"
								disabled={translatingDesc()}
								onClick={handleTranslateDesc}
							>
								<Languages class="size-4" />
								翻译简介
							</Button>
						</CardFooter>
					</Card>
				</Show>

				{/* Log */}
				<Card>
					<CardHeader>
						<CardTitle>{m.task_runLog()}</CardTitle>
					</CardHeader>
					<CardContent class="px-0">
							{logLines().length > 0 ? (
				<pre class="max-h-96 overflow-auto px-4 text-xs leading-relaxed font-mono">
								<For each={logLines()}>
									{(line) => <div>{line}</div>}
								</For>
							</pre>
							): (<div class="px-4 py-8 text-center text-sm text-muted-foreground">
									{m.task_emptyLog()}
								</div>)}
					</CardContent>
				</Card>

				{/* Danger Zone */}
				<Card>
					<CardHeader>
						<CardTitle class="text-red-600">危险操作</CardTitle>
						<CardDescription>
							这些操作不可撤销
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-3">
						{/* Resume */}
						<Show when={isFailed()}>
							<div class="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
								<div class="flex items-center gap-2 text-sm text-amber-800">
									<AlertTriangle class="size-4 shrink-0" />
									<span>任务失败，可以从失败处继续</span>
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={resuming()}
									onClick={handleResume}
								>
									<Show
										when={resuming()}
										fallback={<Play class="size-3.5" />}
									>
										<Loader2 class="size-3.5 animate-spin" />
									</Show>
									继续
								</Button>
							</div>
						</Show>

						{/* Delete */}
						<div class="flex items-center justify-between gap-4 rounded-lg border border-red-200 px-4 py-3">
							<div class="flex items-center gap-2 text-sm text-red-700">
								<Trash2 class="size-4 shrink-0" />
								<span>删除任务及所有文件</span>
							</div>
							<Dialog>
								<DialogTrigger>
									<Button variant="destructive" size="sm">
										<Trash2 class="size-3.5" />
										删除
									</Button>
								</DialogTrigger>
								<DialogContent size="sm" showCloseButton>
									<DialogHeader>
										<DialogTitle>确认删除</DialogTitle>
										<DialogDescription>
											此操作将删除任务及所有文件，不可撤销。
										</DialogDescription>
									</DialogHeader>
									<DialogFooter>
										<Button
											variant="destructive"
											size="sm"
											disabled={deleting()}
											onClick={handleDelete}
										>
											<Show
												when={deleting()}
												fallback={<Trash2 class="size-3.5" />}
											>
												<Loader2 class="size-3.5 animate-spin" />
											</Show>
											确认删除
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</div>
					</CardContent>
				</Card>
			</Show>
		</div>
	);
}
