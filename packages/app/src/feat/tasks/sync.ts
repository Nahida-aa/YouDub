import {
	taskStagesSchema,
	tasksSchema,
} from '@repo/api/src/feat/tasks/schema.ts';
import {
	createCollection,
	eq,
	type InferCollectionType,
	type InitialQueryBuilder,
} from '@tanstack/solid-db';
// import { socketCollectionOptions } from '#/components/socket/socketCollection/collection.ts';
import { socketCollectionOptions } from 'socket-collection/collection.ts';
import { socket } from '#/components/socket/ws.ts';

export const tasksCollect = createCollection(
	socketCollectionOptions({
		socket,
		id: 'tasks',
		schema: tasksSchema,
		getKey: (todo) => todo.id,
		// Note: No onInsert/onUpdate/onDelete - handled by Socket automatically
		syncMode: 'on-demand',
	}),
);

export const taskStagesCollect = createCollection(
	socketCollectionOptions({
		socket,
		id: 'task_stages',
		schema: taskStagesSchema,
		getKey: (stage) => `${stage.task_id}-${stage.name}`,
		syncMode: 'on-demand',
	}),
);

export type TasksRow = InferCollectionType<typeof tasksCollect>;

export const tasksQ = (q: InitialQueryBuilder) =>
	q.from({ tasks: tasksCollect }).select(({ tasks }) => tasks);

export const tasksQById = (id: string) => (q: InitialQueryBuilder) =>
	tasksQ(q)

		.where(({ tasks }) => eq(tasks.id, id))

		.findOne();

export const stagesQByTaskId = (taskId: string) => (q: InitialQueryBuilder) =>
	q
		.from({ stages: taskStagesCollect })
		.where(({ stages }) => eq(stages.task_id, taskId))
		.select(({ stages }) => stages);

export const createTask = async (url: string) => {
	const ret = await socket.emitWithAck('createTask', url);
	if (ret.ok === false) {
		throw new Error(ret.error.msg);
	}
	return ret.data;
};
