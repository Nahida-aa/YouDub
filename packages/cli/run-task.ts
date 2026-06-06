import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import {
	REPO_ROOT,
	WORKFOLDER,
	YOUTUBE_COOKIE_PATH,
	env,
} from '@repo/config';
import { db } from './src/db/index.ts';
import { createTask, findTaskByVideoId } from './src/feat/tasks/fn.ts';
import {
	getStageStatuses,
	rerunSingleStage,
	resumePipeline,
	runPipeline,
} from './src/feat/tasks/pipeline-runner.ts';
import { tasks } from './src/feat/tasks/table.ts';
import { extractVideoId, isYouTubeUrl } from './src/feat/tasks/validate.ts';
import { timeId } from '../shared/db/timeId.ts';

type Command =
	| 'startTask'
	| 'resumeTask'
	| 'rerunStage'
	| 'checkVideo'
	| 'taskStatus'
	| 'createTask'
	| 'deviceInfo';

const config = JSON.parse(readFileSync('./config.json', 'utf-8')) as {
	command?: Command;
	startTask?: { taskId?: string };
	createTask?: { youtubeUrl?: string; bilibiliUrl?: string; sourceFile?: string; sourceLang?: string; targetLang?: string };
	resumeTask?: { taskId?: string; resumeFrom?: string };
	rerunStage?: { taskId?: string; stageName?: string };
	checkVideo?: { taskId?: string };
	taskStatus?: { taskId?: string };
	deviceInfo?: Record<string, never>;
};

const cmd: Command = config.command ?? 'startTask';

switch (cmd) {
	case 'checkVideo': {
		const taskId = config.checkVideo?.taskId;
		if (!taskId) {
			console.error('checkVideo.taskId required in config.json');
			process.exit(1);
		}
		const rows = await db
			.select({ session_path: tasks.session_path })
			.from(tasks)
			.where(eq(tasks.id, taskId))
			.limit(1);
		const sp = rows[0]?.session_path;
		const basePath = sp ? resolve(REPO_ROOT, sp) : join(WORKFOLDER, taskId);
		const videoPath = join(basePath, 'media', 'video_source.mp4');
		if (!existsSync(videoPath)) {
			console.log(
				JSON.stringify({ ok: false, error: 'video_source.mp4 not found' }),
			);
			process.exit(1);
		}
		const stat = statSync(videoPath);
		console.log(
			JSON.stringify({
				ok: true,
				path: videoPath,
				size: stat.size,
			}),
		);
		break;
	}

	case 'taskStatus': {
		const taskId = config.taskStatus?.taskId;
		if (!taskId) {
			console.error('taskStatus.taskId required in config.json');
			process.exit(1);
		}
		try {
			const status = await getStageStatuses(taskId);
			console.log(JSON.stringify(status, null, 2));
		} catch (err) {
			console.error('taskStatus failed:', err);
			process.exit(1);
		}
		break;
	}

	case 'deviceInfo': {
		const { getDeviceInfo } = await import('@repo/device');
		const info = await getDeviceInfo();
		console.log(JSON.stringify(info, null, 2));
		break;
	}

	case 'createTask': {
		const p = config.createTask ?? {};
		const url = p.youtubeUrl ?? p.bilibiliUrl;
		if (!url && !p.sourceFile) {
			console.error('createTask: need youtubeUrl, bilibiliUrl, or sourceFile in config.json');
			process.exit(1);
		}
		const videoId = url ? extractVideoId(url) : timeId({ size: 10 });
		try {
			if (url) {
				const existing = await findTaskByVideoId(videoId);
				if (existing) {
					const row = await db
						.select()
						.from(tasks)
						.where(eq(tasks.id, existing))
						.limit(1);
					console.log(
						JSON.stringify(
							{ taskId: existing, url, status: 'exists', task: row[0] },
							null,
							2,
						),
					);
					break;
				}
			}

			const [task] = await createTask({
				url,
				taskId: videoId,
				sourceFile: p.sourceFile,
				sourceLang: p.sourceLang,
				targetLang: p.targetLang,
			});

			// Fetch video title via yt-dlp --dump-json (optional)
			if (url) {
				try {
					const infoArgs = ['--dump-json'];
					if (isYouTubeUrl(url) && existsSync(YOUTUBE_COOKIE_PATH))
						infoArgs.push('--cookies', YOUTUBE_COOKIE_PATH);
					if (isYouTubeUrl(url) && env.YTDLP_PROXY_PORT)
						infoArgs.push('--proxy', `http://127.0.0.1:${env.YTDLP_PROXY_PORT}`);
					infoArgs.push(url);
					const infoR = spawnSync('yt-dlp', infoArgs, {
						stdio: ['pipe', 'pipe', 'pipe'],
						timeout: 30_000,
					});
					if (infoR.status === 0 && infoR.stdout.length > 0) {
						const info = JSON.parse(infoR.stdout.toString());
						if (info.title) {
							await db
								.update(tasks)
								.set({ title: info.title })
								.where(eq(tasks.id, videoId));
							task.title = info.title;
						}
					}
				} catch {
					/* title is optional */
				}
			}

			const displayUrl = url || p.sourceFile || '';
			console.log(
				JSON.stringify(
					{ taskId: videoId, url: displayUrl, status: 'created', task },
					null,
					2,
				),
			);

			console.log(`\n[CLI] Running pipeline for task ${videoId}...`);
			await runPipeline(videoId);
			console.log('[CLI] Pipeline completed');
		} catch (err) {
			console.error('createTask failed:', err);
			process.exit(1);
		}
		break;
	}

	case 'resumeTask': {
		const taskId = config.resumeTask?.taskId;
		if (!taskId) {
			console.error('resumeTask.taskId required in config.json');
			process.exit(1);
		}
		const resumeFrom = config.resumeTask?.resumeFrom;
		const label = resumeFrom ? ` from "${resumeFrom}"` : '';
		console.log(`[CLI] Resuming pipeline for task ${taskId}${label}...`);
		try {
			await resumePipeline(taskId, resumeFrom);
			console.log('[CLI] Pipeline completed');
		} catch (err) {
			console.error('[CLI] Pipeline failed:', err);
			process.exit(1);
		}
		break;
	}

	case 'rerunStage': {
		const taskId = config.rerunStage?.taskId;
		const stageName = config.rerunStage?.stageName;
		if (!taskId || !stageName) {
			console.error('rerunStage.taskId and rerunStage.stageName required in config.json');
			process.exit(1);
		}
		console.log(`[CLI] Rerunning stage "${stageName}" for task ${taskId}...`);
		try {
			await rerunSingleStage(taskId, stageName);
			console.log('[CLI] Stage completed');
		} catch (err) {
			console.error('[CLI] Stage failed:', err);
			process.exit(1);
		}
		break;
	}

	case 'startTask':
	default: {
		const taskId = config.startTask?.taskId;
		if (!taskId) {
			console.error('startTask.taskId required in config.json');
			process.exit(1);
		}
		console.log(`[CLI] Starting pipeline for task ${taskId}...`);
		try {
			await runPipeline(taskId);
			console.log('[CLI] Pipeline completed');
		} catch (err) {
			console.error('[CLI] Pipeline failed:', err);
			process.exit(1);
		}
	}
}
