import { z } from 'zod';
import type { ModelStatus } from '#/ml/voxcpm/load.ts';

export interface ServerToClientEvents {
	noArg: () => void;
	basicEmit: (a: number, b: string, c: Uint8Array) => void;
	withAck: (d: string, callback: (e: number) => void) => void;
	reply: (data: { received: boolean } | { from: string }) => void;
	msg: (data: string[]) => void;
	echo: (data: { hello: string }) => void;
	'test:event': (data: { message: string }) => void;
	'broadcast:event': (data: { message: string }) => void;
	'ml:voxcpm:status': (status: ModelStatus) => void;
	'ml:voxcpm:progress': (data: { message: string; percent: number }) => void;
}

export interface ClientToServerEvents {
	hello: () => void;
	message: (data: string) => void;
	msg: (text: string) => void;
	ping: (callback: (response: string) => void) => void;
	echo: (data: { hello: string }) => void;
	binaryEcho: (data: Uint8Array) => void;
	'ml:voxcpm:prepare': (
		data: {},
		callback: (response: {
			status: 'success' | 'error' | 'processing';
			message: string;
		}) => void,
	) => void;
	'test:event': (data: { timestamp: number }) => void;
	'ml:voxcpm:check': () => void;
}

export interface InterServerEvents {
	ping: () => void;
}

export interface SocketData {
	name: string;
	age: number;
}

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
