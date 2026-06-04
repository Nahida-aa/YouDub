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
import { useAppForm } from '@repo/ui-solid/form/useAppForm';
import { useLiveQuery } from '@tanstack/solid-db';
import { createFileRoute, Link, useNavigate } from '@tanstack/solid-router';
import { ChevronRight, Play, Upload } from 'lucide-solid';
import { createEffect, createSignal, For, onMount, Show } from 'solid-js';
import { TasksHistory } from '#/components/pages/index/tasks.tsx';
import { tasksCollect, tasksQ } from '#/feat/tasks/sync.ts';
import type { LocalDirection, TaskSummary } from '../lib/api';
import { createTask, listTasks, uploadLocalTask } from '../lib/api';

export const Route = createFileRoute('/')({
	component: Home,
	onError: (err) => {
		console.error('Error loading home route:', err);
	},
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

function Home() {
	const navigate = useNavigate();

	let fileInputRef!: HTMLInputElement;

	const form = useAppForm(() => ({
		defaultValues: {
			youtubeUrl: '',
			bilibiliUrl: '',
			localFile: null as File | null,
			localDirection: 'en-zh' as LocalDirection,
		},
		onSubmit: async ({ value, formApi }) => {
			const submittedUrl = value.youtubeUrl.trim() || value.bilibiliUrl.trim();
			if (!submittedUrl && !value.localFile) {
				throw new Error('请提供 YouTube/Bilibili 链接或选择本地视频文件');
			}
			const created = value.localFile
				? await uploadLocalTask(value.localFile, value.localDirection)
				: await createTask(submittedUrl);
			formApi.setFieldValue('youtubeUrl', '');
			formApi.setFieldValue('bilibiliUrl', '');
			formApi.setFieldValue('localFile', null);
			if (fileInputRef) fileInputRef.value = '';
			navigate({ to: '/tasks/$id', params: { id: created.id } });
		},
	}));

	const directionLabels = [
		{
			value: 'en-zh',
			label: '英 → 中',
		},
		{
			value: 'zh-en',
			label: '中 → 英',
		},
	];

	console.log('Home component rendered');

	return (
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle>创建任务</CardTitle>
				</CardHeader>
				<CardContent>
					<form.AppForm>
						<form.Form onSubmit={form.handleSubmit} class="space-y-4">
							<form.AppField
								name="youtubeUrl"
								children={(field) => (
									<field.InputField
										title="YouTube 链接"
										placeholder="https://www.youtube.com/watch?v=..."
									/>
								)}
							/>
							<form.AppField
								name="bilibiliUrl"
								children={(field) => (
									<field.InputField
										title="Bilibili 链接"
										placeholder="https://www.bilibili.com/video/BV..."
									/>
								)}
							/>

							<div class="grid gap-3 sm:grid-cols-[1fr_180px]">
								<form.AppField
									name="localFile"
									children={(field) => (
										<field.FileInputField
											title="本地视频"
											type="file"
											ref={fileInputRef!}
											accept="video/*,.mp4,.mov,.m4v,.mkv,.webm,.avi,.flv,.wmv"
										/>
									)}
								/>
								<form.AppField
									name="localDirection"
									children={(field) => (
										<field.SelectField
											title="翻译方向"
											options={directionLabels}
											class="h-8"
										/>
									)}
								/>
							</div>
							<div class="flex items-center justify-between gap-3">
								<div></div>
								<form.SubmitButton
									label="创建任务"
									icon={<Play class="size-4" />}
								/>
							</div>
						</form.Form>
					</form.AppForm>
				</CardContent>
			</Card>

			<TasksHistory />
		</div>
	);
}
