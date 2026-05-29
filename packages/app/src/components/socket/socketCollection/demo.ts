import { createCollection } from '@tanstack/solid-db';
import { z } from 'zod';
import { socketCollectionOptions } from '#/components/socket/sync.ts';
import { socket } from '#/components/socket/ws.ts';

const todoSchema = z.object({
	id: z.string(),
	text: z.string(),
	completed: z.boolean(),
});

const todoCollect = createCollection(
	socketCollectionOptions({
		socket,
		id: 'todo',
		schema: todoSchema,
		getKey: (todo) => todo.id,
		// Note: No onInsert/onUpdate/onDelete - handled by Socket automatically
	}),
);

// Use the collection
todoCollect.insert({ id: '1', text: 'Buy milk', completed: false });
