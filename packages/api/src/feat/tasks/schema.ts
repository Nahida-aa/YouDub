import type { InferSelectModel } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import type { z } from 'zod';
import { tasks } from '#/feat/tasks/table.ts';

export type Tasks = InferSelectModel<typeof tasks>;

// 避免跨包丢失类型推导
export const tasksSchema: z.ZodType<Tasks> = createSelectSchema(tasks);
