import { relations } from 'drizzle-orm/relations';
import { taskStages, tasks } from './schema';

export const taskStagesRelations = relations(taskStages, ({ one }) => ({
	task: one(tasks, {
		fields: [taskStages.taskId],
		references: [tasks.id],
	}),
}));

export const tasksRelations = relations(tasks, ({ many }) => ({
	taskStages: many(taskStages),
}));
