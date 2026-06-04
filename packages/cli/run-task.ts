import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { REPO_ROOT, WORKFOLDER } from './src/config/config.ts';
import { db } from './src/db/index.ts';
import { runPipeline, resumePipeline, rerunSingleStage } from './src/feat/tasks/pipeline-runner.ts';
import { tasks } from './src/feat/tasks/table.ts';

type Command = 'startTask' | 'resumeTask' | 'rerunStage' | 'checkVideo';

const config = JSON.parse(readFileSync('./config.json', 'utf-8')) as {
	command?: Command;
	taskId?: string;
	stageName?: string;
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

	case 'resumeTask': {
		const taskId = config.taskId;
		if (!taskId) {
			console.error('No taskId in config.json');
			process.exit(1);
		}
		console.log(`[CLI] Resuming pipeline for task ${taskId}...`);
		try {
			await resumePipeline(taskId);
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
