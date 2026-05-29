import { desc } from 'drizzle-orm';
import { db } from '#/db/index.ts';
import { tasks } from '#/feat/tasks/table.ts';

export function listTasks() {
	return db
		.select()
		.from(tasks)
		.orderBy(desc(tasks.created_at), desc(tasks.id))
		.all();
}
