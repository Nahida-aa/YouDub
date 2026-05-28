import { z } from 'zod';

/**
 * Socket.io 风格的 Packet 格式: [event, data]
 */
export const SioPacketSchema = z.tuple([
  z.string(), // Event Name
  z.any()     // Data
]);


// --- 业务数据模型 ---

export const TaskSummarySchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  current_stage: z.string().nullable(),
  created_at: z.string(),
});

export const TaskSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  current_stage: z.string().nullable(),
  session_path: z.string().nullable(),
  final_video_path: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  stages: z.array(z.any()), // 简化处理
});

// --- 订阅请求数据 ---

export const SubscribeSchema = z.object({
  topic: z.enum(['tasks:list', 'tasks:detail', 'tasks:log']),
  id: z.string().optional(),
});

export type SubscribePayload = z.infer<typeof SubscribeSchema>;
