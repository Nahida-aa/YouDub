import { z } from 'zod';
import type { ModelStatus } from '#/ml/voxcpm/load.ts';
import type { CookieInfo } from '#/settings/cookie.ts';

export const WsErrorCode = {
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	IO_ERROR: 'IO_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type WsErrorCode = (typeof WsErrorCode)[keyof typeof WsErrorCode];

export type WsError<C extends WsErrorCode = WsErrorCode, D = undefined> = {
	code: C;
	msg: string;
	details?: D;
};

export type RetErr<C extends WsErrorCode = WsErrorCode, D = undefined> = {
	ok: false;
	error: WsError<C, D>;
};

export type Ret<
	T = undefined,
	C extends WsErrorCode = WsErrorCode,
	D = undefined,
> = T | RetErr<C, D>;

export type TransactionMutation = {
	type: 'insert' | 'update' | 'delete';
	id?: string;
	data?: unknown;
};

export type TransactionPayload = {
	id: string;
	transactionId: string;
	mutations: TransactionMutation[];
};

export type TransactionAck =
	| { ok: true }
	| {
			ok: false;
			error: string;
	  };

export const newErr = <C extends WsErrorCode, D = undefined>(
	code: C,
	msg: string,
	details?: D,
): RetErr<C, D> => ({
	ok: false,
	error: details === undefined ? { code, msg } : { code, msg, details },
});

type AckFn<I = undefined, T = undefined> = (input: I) => Promise<T> | T;

const getErrorMessage = (error: unknown) =>
	error instanceof Error
		? error.message
		: typeof error === 'string'
			? error
			: 'Unknown error';

export const errorHandler = <I = undefined, T = undefined>(fn: AckFn<I, T>) => {
	return async (input: I, result: (ret: Ret<T>) => void) => {
		try {
			const data = await fn(input);
			result(data);
		} catch (error) {
			console.error('Error in WebSocket handler:', error);
			result(newErr('INTERNAL_ERROR', getErrorMessage(error)) as Ret<T>);
		}
	};
};

export interface ClientToServerEvents {
	save_youtube_cookie: (
		input: string,
		result: (res: Ret<CookieInfo>) => void,
	) => void;

	hello: () => void;
	message: (data: string) => void;
	msg: (text: string) => void;
	ping: (callback: (response: string) => void) => void;
	sync: (payload: { id: string }) => void;
	echo: (data: { hello: string }) => void;
	binaryEcho: (data: Uint8Array) => void;
	transaction: (
		payload: TransactionPayload,
		callback: (response: TransactionAck) => void,
	) => void;
	'ml:voxcpm:prepare': (
		data: Record<string, never>,
		callback: (response: {
			status: 'success' | 'error' | 'processing';
			message: string;
		}) => void,
	) => void;
	'test:event': (data: { timestamp: number }) => void;
	'ml:voxcpm:check': () => void;
	subscribe: (data: { topic: string }) => void;
	unsubscribe: (data: { topic: string }) => void;
}

export interface ServerToClientEvents {
	noArg: () => void;
	basicEmit: (a: number, b: string, c: Uint8Array) => void;
	withAck: (d: string, callback: (e: number) => void) => void;
	reply: (data: { received: boolean } | { from: string }) => void;
	msg: (data: string[]) => void;
	echo: (data: { hello: string }) => void;
	sync: (rows: Array<Record<string, unknown>>) => void;
	transaction: (payload: TransactionPayload) => void;
	'test:event': (data: { message: string }) => void;
	'broadcast:event': (data: { message: string }) => void;
	'ml:voxcpm:status': (status: ModelStatus) => void;
	'ml:voxcpm:progress': (data: { message: string; percent: number }) => void;
	// listTasks: (data: TaskSummary[]) => void;
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
