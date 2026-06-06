import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import {
	REPO_ROOT,
	WORKFOLDER,
	YOUTUBE_COOKIE_PATH,
} from './src/config/config.ts';
import { env } from './src/config/env.ts';
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

type Command =
	| 'startTask'
	| 'resumeTask'
	| 'rerunStage'
	| 'checkVideo'
	| 'taskStatus'
	| 'createTask';

const config = JSON.parse(readFileSync('./config.json', 'utf-8')) as {
	command?: Command;
	taskId?: string;
	stageName?: string;
	youtubeUrl?: string;
	resumeFrom?: string;
};

const cmd: Command = config.command ?? 'startTask';

switch (cmd) {
	case 'checkVideo': {
		const taskId = config.taskId;
		if (!taskId) {
			console.error('No taskId in config.json');
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
		const taskId = config.taskId;
		if (!taskId) {
			console.error('No taskId in config.json');
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

	case 'createTask': {
		const url = config.youtubeUrl;
		if (!url) {
			console.error('url required in config.json');
			process.exit(1);
		}
		try {
			const videoId = extractVideoId(url);
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

			const [task] = await createTask(url, videoId);

			// Fetch video title via yt-dlp --dump-json (optional)
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

			console.log(
				JSON.stringify(
					{ taskId: videoId, url, status: 'created', task },
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
		const taskId = config.taskId;
		if (!taskId) {
			console.error('No taskId in config.json');
			process.exit(1);
		}
		const resumeFrom = config.resumeFrom;
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
		const taskId = config.taskId;
		const stageName = config.stageName;
		if (!taskId || !stageName) {
			console.error('taskId and stageName required in config.json');
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
		const taskId = config.taskId;
		if (!taskId) {
			console.error('No taskId in config.json');
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
