import { Badge } from '@repo/ui-solid/base/badge';
import { Button } from '@repo/ui-solid/base/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@repo/ui-solid/base/card';
import { Input } from '@repo/ui-solid/base/input';
import { Label } from '@repo/ui-solid/base/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@repo/ui-solid/base/select';
import { useLiveQuery } from '@tanstack/solid-db';
import { createFileRoute, Link, useNavigate } from '@tanstack/solid-router';
import { ChevronRight, Play, Upload } from 'lucide-solid';
import { createSignal, For, onMount, Show } from 'solid-js';
import { tasksCollect, tasksQ } from '#/feat/tasks/sync.ts';
import type { LocalDirection, TaskSummary } from '../lib/api';
import { createTask, listTasks, uploadLocalTask } from '../lib/api';

export const Route = createFileRoute('/')({
	component: Home,
});

function statusBadgeClass(status?: string): string {
	switch (status) {
		case 'succeeded':
			return 'bg-blue-500/10 text-blue-600 border-blue-200';
		case 'failed':
			return 'bg-red-500/10 text-red-600 border-red-200';
		case 'running':
			return 'bg-pink-500/10 text-pink-600 border-pink-200';
		case 'queued':
			return 'bg-amber-500/10 text-amber-600 border-amber-200';
		default:
			return 'bg-muted text-muted-foreground';
	}
}

function statusLabel(status?: string): string {
	const map: Record<string, string> = {
		succeeded: '已完成',
		failed: '失败',
		running: '运行中',
		queued: '排队中',
	};
	return map[status ?? ''] ?? status ?? '未知';
}

function stageLabel(name?: string): string {
	const map: Record<string, string> = {
		download: '下载',
		separate: '人声分离',
		asr: '语音识别',
		asr_fix: '句子修正',
		translate: '翻译',
		split_audio: '切分音频',
		tts: '语音合成',
		merge_audio: '合成音频',
		merge_video: '合成视频',
	};
	return map[name ?? ''] ?? name ?? '';
}

function isActive(status: string) {
	return status === 'queued' || status === 'running';
}

function formatTime(value: string | null) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function shortUrl(url: string) {
	return url.replace(/^https?:\/\/(www\.)?/, '');
}

function Home() {
	const navigate = useNavigate();
	const tasks = useLiveQuery((q) => tasksQ(q));

	const [error, setError] = createSignal('');
	const [submitting, setSubmitting] = createSignal(false);
	const [youtubeUrl, setYoutubeUrl] = createSignal('');
	const [bilibiliUrl, setBilibiliUrl] = createSignal('');
	const [localFile, setLocalFile] = createSignal<File | null>(null);
	const [localDirection, setLocalDirection] =
		createSignal<LocalDirection>('en-zh');
	let fileInputRef!: HTMLInputElement;

	function selectLocalFile(event: Event) {
		setError('');
		const target = event.target as HTMLInputElement;
		setLocalFile(target.files?.[0] || null);
	}

	async function submitTask(event: Event) {
		event.preventDefault();
		setError('');
		const submittedUrl = youtubeUrl().trim() || bilibiliUrl().trim();
		if (!submittedUrl && !localFile()) return;
		setSubmitting(true);
		try {
			const created = localFile()
				? await uploadLocalTask(localFile()!, localDirection())
				: await createTask(submittedUrl);
			setYoutubeUrl('');
			setBilibiliUrl('');
			setLocalFile(null);
			if (fileInputRef) fileInputRef.value = '';
			navigate({ to: '/tasks/$id', params: { id: created.id } });
		} catch (err) {
			setError(err instanceof Error ? err.message : '创建失败');
		} finally {
			setSubmitting(false);
		}
	}

	const hasUrl = () => Boolean(youtubeUrl().trim() || bilibiliUrl().trim());
	const hasLocalFile = () => Boolean(localFile());
	const canSubmit = () =>
		Boolean((hasUrl() || hasLocalFile()) && !submitting());
	const queuedCount = () => tasks().filter((t) => isActive(t.status)).length;
	const directionLabels: Record<string, string> = {
		'en-zh': '英 → 中',
		'zh-en': '中 → 英',
	};
	console.log('Home component rendered');
	return (
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle>创建任务</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={submitTask} class="space-y-4">
						<div class="space-y-2">
							<Label for="youtube-url">YouTube 链接</Label>
							<Input
								id="youtube-url"
								value={youtubeUrl()}
								onInput={(e) => setYoutubeUrl(e.currentTarget.value)}
								placeholder="https://www.youtube.com/watch?v=..."
								disabled={bilibiliUrl().trim().length > 0 || hasLocalFile()}
							/>
						</div>
						<div class="space-y-2">
							<Label for="bilibili-url">Bilibili 链接</Label>
							<Input
								id="bilibili-url"
								value={bilibiliUrl()}
								onInput={(e) => setBilibiliUrl(e.currentTarget.value)}
								placeholder="https://www.bilibili.com/video/BV..."
								disabled={youtubeUrl().trim().length > 0 || hasLocalFile()}
							/>
						</div>
						<div class="grid gap-3 sm:grid-cols-[1fr_180px]">
							<div class="space-y-2">
								<Label for="local-video">本地视频</Label>
								<Input
									id="local-video"
									type="file"
									ref={fileInputRef!}
									accept="video/*,.mp4,.mov,.m4v,.mkv,.webm,.avi,.flv,.wmv"
									onChange={selectLocalFile}
									disabled={hasUrl()}
								/>
							</div>
							<div class="space-y-2">
								<Label for="local-direction">翻译方向</Label>
								<Select
									options={['en-zh', 'zh-en']}
									value={localDirection()}
									onChange={(v) => setLocalDirection(v as LocalDirection)}
									disabled={hasUrl()}
									itemComponent={(props) => (
										<SelectItem item={props.item}>
											{directionLabels[props.item.rawValue]}
										</SelectItem>
									)}
								>
									<SelectTrigger id="local-direction">
										<SelectValue<string>>
											{(state) =>
												directionLabels[state.selectedOption()] ??
												state.selectedOption()
											}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
							</div>
						</div>
						<div class="flex items-center justify-between gap-3">
							<Show when={queuedCount() > 0}>
								<p class="text-xs text-muted-foreground">
									{queuedCount()} 个任务进行中
								</p>
							</Show>
							<Show when={queuedCount() === 0}>
								<span />
							</Show>
							<Button type="submit" disabled={!canSubmit()}>
								<Show when={hasLocalFile()} fallback={<Play class="size-4" />}>
									<Upload class="size-4" />
								</Show>
								{submitting() ? '提交中...' : '创建任务'}
							</Button>
						</div>
					</form>
					<Show when={error()}>
						<div class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{error()}
						</div>
					</Show>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>任务历史 ({tasks().length})</CardTitle>
				</CardHeader>
				<CardContent class="px-0">
					<Show
						when={tasks().length > 0}
						fallback={
							<div class="px-6 py-12 text-center text-sm text-muted-foreground">
								暂无任务
							</div>
						}
					>
						<ul class="flex flex-col">
							<For each={tasks()}>
								{(item) => (
									<li class="border-b border-border/60 last:border-b-0">
										<Link
											to="/tasks/$id"
											params={{ id: item.id }}
											class="flex w-full items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-muted/60"
										>
											<div class="min-w-0 flex-1">
												<p class="truncate text-left font-medium text-zinc-900 dark:text-zinc-100">
													{item.title || shortUrl(item.url)}
												</p>
												<div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
													<Badge class={statusBadgeClass(item.status)}>
														{statusLabel(item.status)}
													</Badge>
													<span>{formatTime(item.created_at)}</span>
													<Show
														when={isActive(item.status) && item.current_stage}
													>
														<span>· {stageLabel(item.current_stage!)}</span>
													</Show>
												</div>
											</div>
											<ChevronRight class="size-4 shrink-0 text-muted-foreground" />
										</Link>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</CardContent>
			</Card>
		</div>
	);
}
