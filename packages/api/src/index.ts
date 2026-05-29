import { websocket } from 'hono/bun';
import { engine } from '#/socket.io/api.ts';
// import { io } from '#/ws/route.ts';
import app from './app';

// const socketIo = engine.handler();

export default Bun.serve({
	port: 9007,
	idleTimeout: 60,
	fetch(req: Request, server: any) {
		// 拦截 Socket.IO 请求
		// if (req.url.includes('/ws/')) {
		// 	return socketIo.fetch(req, server);
		// }
		// 其他请求交给 Hono
		return app.fetch(req, server);
	},
	websocket,
	// websocket: io.websocket, // 使用 siokit 的 websocket 处理器
	// websocket: socketIo.websocket,
	// maxRequestBodySize: socketIo.maxRequestBodySize,
});
