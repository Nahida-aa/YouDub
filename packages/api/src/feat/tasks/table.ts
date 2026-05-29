import {
	AnySQLiteColumn,
	foreignKey,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
	id: text().primaryKey(),
	url: text().notNull(),
	title: text(),
	status: text().notNull(),
	current_stage: text('current_stage'),
	session_path: text('session_path'),
	final_video_path: text('final_video_path'),
	error_message: text('error_message'),
	created_at: text('created_at').notNull(),
	started_at: text('started_at'),
	completed_at: text('completed_at'),
});

export const taskStages = sqliteTable(
	'task_stages',
	{
		taskId: text('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		name: text().notNull(),
		label: text().notNull(),
		status: text().notNull(),
		startedAt: text('started_at'),
		completedAt: text('completed_at'),
		lastMessage: text('last_message'),
		errorMessage: text('error_message'),
		progress: integer(),
	},
	(table) => [
		primaryKey({
			columns: [table.taskId, table.name],
			name: 'task_stages_task_id_name_pk',
		}),
	],
);
