import type { InferSelectModel } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import type { z } from 'zod';
import { tasks } from '#/feat/tasks/table.ts';

export type Tasks = InferSelectModel<typeof tasks>;

export const tasksSchema: z.ZodType<Tasks> = createSelectSchema(tasks);
