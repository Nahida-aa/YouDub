import type { QuerySchema } from 'agnostic-query';
import { z } from 'zod';
import type { CookieInfo } from '#/feat/settings/cookie.ts';
import type { ModelStatus } from '#/ml/voxcpm/load.ts';
import { AppErr, AppError, appErrCode, newErr, type Ret } from '#/ws/errors.ts';
import type { TableName } from '#/ws/registry.ts';

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
			if (error instanceof AppError) {
				result(error.toJSON() as Ret<T>);
			} else if (error instanceof z.ZodError) {
				result(
					newErr(
						appErrCode.VALIDATION_ERROR,
						error.message,
						error.issues,
					) as Ret<T>,
				);
			} else {
				result(
					newErr(appErrCode.INTERNAL_ERROR, getErrorMessage(error)) as Ret<T>,
				);
			}
		}
	};
};

export type LoadSubsetPayload = QuerySchema & {
	table: TableName;
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
	loadSubset: (
		payload: LoadSubsetPayload,
		callback: (res: Ret<Array<Record<string, unknown>>>) => void,
	) => void;
	unloadSubset: (payload: LoadSubsetPayload) => void;
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
