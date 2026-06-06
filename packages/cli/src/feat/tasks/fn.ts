import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db } from './../../db/index.ts';
import { STAGES } from './../../feat/tasks/stages.ts';
import { taskStages, tasks } from './../../feat/tasks/table.ts';
import { WORKFOLDER } from './../../config/config.ts';

export function sanitizeText(value: string, fallback = 'untitled'): string {
	const cleaned = value.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+|[._]+$/g, '');
	return cleaned.slice(0, 120) || fallback;
}

export function nowISO(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, '');
}

export async function findTaskByVideoId(
	videoId: string,
): Promise<string | null> {
	const rows = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(sql`${tasks.id} = ${videoId} OR ${tasks.url} LIKE ${`%${videoId}%`}`)
		.orderBy(sql`created_at DESC, rowid DESC`)
		.limit(1);
	return rows[0]?.id ?? null;
}

export async function createTask(params: {
	url?: string;
	taskId: string;
	sourceFile?: string;
	sourceLang?: string;
	targetLang?: string;
}) {
	const createdAt = nowISO();
	let taskUrl = params.url!;

	if (params.sourceFile) {
		const direction = `${params.sourceLang || 'zh'}-${params.targetLang || 'en'}`;
		const filename = basename(params.sourceFile);
		const uploadDir = join(WORKFOLDER, '_uploads', params.taskId);
		mkdirSync(uploadDir, { recursive: true });
		copyFileSync(params.sourceFile, join(uploadDir, filename));
		taskUrl = `local://upload/${params.taskId}?direction=${direction}&filename=${encodeURIComponent(filename)}`;

		// Write local_info.json immediately so session_path-based lookup works
		const sessionPath = join(WORKFOLDER, 'local', params.taskId);
		mkdirSync(join(sessionPath, 'metadata'), { recursive: true });
		writeFileSync(join(sessionPath, 'metadata', 'local_info.json'), JSON.stringify({
			id: params.taskId,
			title: filename.replace(/\.\w+$/, ''),
			source: 'local',
			webpage_url: taskUrl,
			original_path: params.sourceFile,
			asr_language: params.sourceLang || 'zh',
			target_language: params.targetLang || 'en',
		}, null, 2));
	}

	const { ret } = await db.transaction(async (tx) => {
		const ret = await tx
			.insert(tasks)
			.values({
				id: params.taskId,
				url: taskUrl,
				status: 'queued',
				current_stage: STAGES[0].name,
				created_at: createdAt,
			})
			.returning();

		await tx
			.insert(taskStages)
			.values(
				STAGES.map((stage) => ({
					task_id: params.taskId,
					name: stage.name,
					label: stage.label,
					status: 'pending',
				})),
			);

		return { ret };
	});

	if (params.sourceFile) {
		await db.update(tasks).set({ session_path: `workfolder/local/${params.taskId}` }).where(eq(tasks.id, params.taskId));
	}

	return ret;
}

const STAGE_ORDER_CASE = sql`CASE ${STAGES.map(
	(s, i) => sql`WHEN ${taskStages.name} = ${s.name} THEN ${i + 1}`,
)} ELSE 99 END`;

export async function updateTask(
	taskId: string,
	fields: Record<string, unknown>,
) {
	if (Object.keys(fields).length === 0) return;
	await db.update(tasks).set(fields).where(eq(tasks.id, taskId));
}

export async function updateStage(
	taskId: string,
	name: string,
	fields: Record<string, unknown>,
) {
	if (Object.keys(fields).length === 0) return;
	await db
		.update(taskStages)
		.set(fields)
		.where(
			sql`${taskStages.task_id} = ${taskId} AND ${taskStages.name} = ${name}`,
		);
}

export async function deleteTask(taskId: string) {
	await db.delete(tasks).where(eq(tasks.id, taskId));
}
