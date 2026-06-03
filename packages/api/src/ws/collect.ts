import { Server as Engine } from '@socket.io/bun-engine';
import { desc, eq } from 'drizzle-orm';
import { db } from '#/db/index.ts';
import type { settings } from '#/feat/settings/table.ts';
import { tasks } from '#/feat/tasks/table.ts';
import type { TransactionPayload } from '#/ws/types.ts';

type TaskRow = typeof tasks.$inferSelect;
type TaskInsert = typeof tasks.$inferInsert;
type SettingsRow = typeof settings.$inferSelect;

type CollectionId = 'tasks' | 'settings';

const TASK_COLUMNS = new Set<keyof TaskInsert>([
	'id',
	'url',
	'title',
	'status',
	'current_stage',
	'session_path',
	'final_video_path',
	'error_message',
	'created_at',
	'started_at',
	'completed_at',
]);

function toTaskInsert(data: Record<string, unknown>): Partial<TaskInsert> {
	const row: Partial<TaskInsert> = {};
	for (const [key, value] of Object.entries(data)) {
		if (!TASK_COLUMNS.has(key as keyof TaskInsert)) continue;
		if (value === undefined) continue;
		(row as Record<string, unknown>)[key] = value;
	}
	return row;
}

export function assertCollection(id: string): asserts id is CollectionId {
	if (id !== 'tasks' && id !== 'settings') {
		throw new Error(`Unsupported collection: ${id}`);
	}
}

function applyInsert(data: Record<string, unknown>) {
	const row = toTaskInsert(data);
	if (!row.id) {
		throw new Error('Task insert requires an id');
	}
	db.insert(tasks)
		.values(row as TaskInsert)
		.onConflictDoUpdate({
			target: tasks.id,
			set: row,
		});
}

function applyUpdate(id: string, data: Record<string, unknown>) {
	const row = toTaskInsert(data);
	if (Object.keys(row).length === 0) {
		return;
	}
	db.update(tasks).set(row).where(eq(tasks.id, id));
}

function applyDelete(id: string) {
	db.delete(tasks).where(eq(tasks.id, id));
}

export function applyTransaction(payload: TransactionPayload) {
	assertCollection(payload.id);
	db.transaction((tx) => {
		for (const mutation of payload.mutations) {
			if (mutation.type === 'insert') {
				if (!mutation.data || typeof mutation.data !== 'object') {
					throw new Error('Insert mutation requires row data');
				}
				tx.insert(tasks)
					.values(
						toTaskInsert(
							mutation.data as Record<string, unknown>,
						) as TaskInsert,
					)
					.onConflictDoUpdate({
						target: tasks.id,
						set: toTaskInsert(mutation.data as Record<string, unknown>),
					});
				continue;
			}
			if (mutation.type === 'update') {
				if (!mutation.id) {
					throw new Error('Update mutation requires an id');
				}
				if (!mutation.data || typeof mutation.data !== 'object') {
					throw new Error('Update mutation requires row data');
				}
				tx.update(tasks)
					.set(toTaskInsert(mutation.data as Record<string, unknown>))
					.where(eq(tasks.id, mutation.id));
				continue;
			}
			if (!mutation.id) {
				throw new Error('Delete mutation requires an id');
			}
			tx.delete(tasks).where(eq(tasks.id, mutation.id));
		}
	});
}
