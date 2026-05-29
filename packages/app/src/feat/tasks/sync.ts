import { tasksSchema } from '@repo/api/src/feat/tasks/schema.ts';
import {
	createCollection,
	type InferCollectionType,
	type InitialQueryBuilder,
} from '@tanstack/solid-db';
import { socketCollectionOptions } from '#/components/socket/socketCollection/collection.ts';
import { socket } from '#/components/socket/ws.ts';

export const tasksCollect = createCollection(
	socketCollectionOptions({
		socket,
		id: 'tasks',
		schema: tasksSchema,
		getKey: (todo) => todo.id,
		// Note: No onInsert/onUpdate/onDelete - handled by Socket automatically
	}),
);

export type TasksRow = InferCollectionType<typeof tasksCollect>;

export const tasksQ = (q: InitialQueryBuilder) =>
	q.from({ tasks: tasksCollect }).select(({ tasks }) => tasks);
// export const createTaskOpt = ()
