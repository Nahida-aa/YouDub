import { eq, sql } from 'drizzle-orm';
import { db } from '#/db/index.ts';
import { STAGES } from '#/feat/tasks/stages.ts';
import { taskStages, tasks } from '#/feat/tasks/table.ts';
import { io } from '#/socket.io/io.ts';

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

export const createTask = async (url: string, taskId: string) => {
	const createdAt = nowISO();
	const { ret, ret1 } = await db.transaction(async (tx) => {
		const ret = await tx
			.insert(tasks)
			.values({
				id: taskId,
				url,
				status: 'queued',
				current_stage: STAGES[0].name,
				created_at: createdAt,
			})
			.returning();

		const ret1 = await tx
			.insert(taskStages)
			.values(
				STAGES.map((stage) => ({
					task_id: taskId,
					name: stage.name,
					label: stage.label,
					status: 'pending',
				})),
			)
			.returning();

		return { ret, ret1 };
	});
	io.emit('transaction', {
		id: 'tasks',
		transactionId: crypto.randomUUID(),
		mutations: [{ type: 'insert', data: ret[0] }],
	});
	io.emit('transaction', {
		id: 'task_stages',
		transactionId: crypto.randomUUID(),
		mutations: ret1.map((stage) => ({ type: 'insert', data: stage })),
	});
	return ret;
};

const STAGE_ORDER_CASE = sql`CASE ${STAGES.map(
	(s, i) => sql`WHEN ${taskStages.name} = ${s.name} THEN ${i + 1}`,
)} ELSE 99 END`;

export async function getTaskWithStages(taskId: string) {
	const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));

	if (!task) return null;

	const stages = await db
		.select()
		.from(taskStages)
		.where(eq(taskStages.task_id, taskId))
		.orderBy(STAGE_ORDER_CASE);

	return { ...task, stages };
}

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
