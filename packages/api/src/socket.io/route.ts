import { aq } from 'agnostic-query';
import { toDb0 } from 'agnostic-query/db0/sqlite.js';
// import { toDrizzle } from 'agnostic-query/drizzle/sqlite';
import { db, sql } from '#/db/index';
import { save_youtube_cookie } from '#/feat/settings/cookie.ts';
import { createTask } from '#/feat/tasks/fn.ts';
import { applyTransaction, assertCollection } from '#/ws/collect.ts';
import { getTableInfo, tableRegistry } from '#/ws/registry.ts';
import {
	type ClientToServerEvents,
	errorHandler,
	type ServerToClientEvents,
} from '#/ws/types.ts';
import { downloadVoxCPM } from '../ml/voxcpm/download';
import { checkVoxCPMStatus } from '../ml/voxcpm/load';
import { engine, io } from './io.ts';

// 全局任务状态追踪
const voxcpmPrepareTask: {
	status: 'idle' | 'processing' | 'success' | 'error';
	progress: { message: string; percent: number } | null;
} = {
	status: 'idle',
	progress: null,
};

io.on('connection', async (socket) => {
	console.log('New client connected:', socket.id);

	socket.on(
		'save_youtube_cookie',
		errorHandler(async (input) => {
			return await save_youtube_cookie(input);
		}),
	);

	// 发送欢迎消息
	socket.emit('echo', { hello: 'Welcome to YouDub WebSocket API' });

	socket.on('test:event', (data) => {
		console.log('Received test:event with data:', data);
		socket.emit('test:event', { message: 'Test event received!' });

		io.emit('broadcast:event', {
			message: `Client ${socket.id} says hello to everyone!`,
		});
	});

	// 1. 立即检测并同步模型状态
	const status = await checkVoxCPMStatus();
	socket.emit('ml:voxcpm:status', status);

	// 2. 如果当前有正在进行的任务，立即同步进度给新连接的客户端
	if (voxcpmPrepareTask.status === 'processing' && voxcpmPrepareTask.progress) {
		socket.emit('ml:voxcpm:progress', voxcpmPrepareTask.progress);
	}

	// 响应式检测请求
	socket.on('ml:voxcpm:check', async () => {
		const status = await checkVoxCPMStatus();
		socket.emit('ml:voxcpm:status', status);
	});

	// 处理模型准备请求 (请求-响应模式)
	socket.on('ml:voxcpm:prepare', async (data, callback) => {
		console.log('Received ml:voxcpm:prepare request from client:', socket.id);
		if (voxcpmPrepareTask.status === 'processing') {
			return callback({
				status: 'error',
				message: 'A preparation task is already running.',
			});
		}

		const currentStatus = await checkVoxCPMStatus();
		if (currentStatus.isReady) {
			return callback({
				status: 'success',
				message: 'Model is already ready.',
			});
		}

		if (currentStatus.exists) {
			voxcpmPrepareTask.status = 'processing';
			voxcpmPrepareTask.progress = {
				message: 'Starting download...',
				percent: 0,
			};

			// 全局推送开始消息
			io.emit('ml:voxcpm:progress', voxcpmPrepareTask.progress);

			// 直接在 TS 中执行下载
			(async () => {
				try {
					await downloadVoxCPM((percent, message) => {
						const newProgress = { message, percent };
						voxcpmPrepareTask.progress = newProgress;
						io.emit('ml:voxcpm:progress', newProgress);
					});

					voxcpmPrepareTask.status = 'success';
					voxcpmPrepareTask.progress = {
						message: 'All models downloaded!',
						percent: 100,
					};
					io.emit('ml:voxcpm:progress', voxcpmPrepareTask.progress);

					// 更新状态给所有客户端
					const finalStatus = await checkVoxCPMStatus();
					io.emit('ml:voxcpm:status', finalStatus);
				} catch (error: unknown) {
					const message =
						error instanceof Error ? error.message : 'Unknown download error';
					console.error('[WS] Download failed:', error);
					voxcpmPrepareTask.status = 'error';
					voxcpmPrepareTask.progress = {
						message: `Download failed: ${message}`,
						percent: 0,
					};
					io.emit('ml:voxcpm:progress', voxcpmPrepareTask.progress);
				}
			})();

			return callback({ status: 'processing', message: 'Download started.' });
		} else {
			callback({
				status: 'error',
				message: 'Model weights not found. Please run Python backend first.',
			});
		}
	});

	socket.on(
		'createTask',
		errorHandler(async (url) => {
			return await createTask(url);
		}),
	);

	socket.on('sync', async ({ id }) => {
		try {
			assertCollection(id);
			socket.emit(
				'sync',
				await toDb0(
					sql,
					aq({
						table: id,
					}).toJSON(),
				),
			);
		} catch (error) {
			console.error('[WS] Sync failed:', error);
			socket.emit('sync', []);
		}
	});
	socket.on(
		'loadSubset',
		errorHandler(async (payload) => {
			const entry = getTableInfo(payload.table);
			const parsed = entry.validate.parse(payload);
			console.log('[loadSubset] Parsed payload:', parsed);
			return await toDb0(sql, parsed);
		}),
	);

	socket.on('transaction', (payload, callback) => {
		try {
			applyTransaction(payload);
			io.emit('transaction', payload);
			callback({ ok: true });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown transaction error';
			console.error('[WS] Transaction failed:', error);
			callback({ ok: false, error: message });
		}
	});
	socket.on('unloadSubset', (payload) => {
		console.log('[unloadSubset]', payload.table, payload);
	});

	socket.on('disconnect', (reason) => {
		console.log('Client disconnected:', socket.id, 'Reason:', reason);
	});
});

export { engine, io };
