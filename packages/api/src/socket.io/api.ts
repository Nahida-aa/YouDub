import { Server as Engine } from '@socket.io/bun-engine';
import { Server } from 'socket.io';
import { engine, io } from '#/socket.io/io.ts';
import { downloadVoxCPM } from '../ml/voxcpm/download';
import { checkVoxCPMStatus } from '../ml/voxcpm/load';

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
				} catch (error: any) {
					console.error('[WS] Download failed:', error);
					voxcpmPrepareTask.status = 'error';
					voxcpmPrepareTask.progress = {
						message: `Download failed: ${error.message}`,
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

	socket.on('disconnect', () => {
		console.log('Client disconnected:', socket.id);
	});
});

export { engine };
