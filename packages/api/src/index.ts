import { websocket } from 'hono/bun';
import { engine } from '#/socket.io/api.ts';
// import { io } from '#/ws/route.ts';
import app from './app';

const io = engine.handler();

export default Bun.serve({
	port: 9007,
	idleTimeout: 60,
	fetch(req: Request, server: any) {
		if (req.url.includes('/ws/')) {
			return io.fetch(req, server);
		}
		// 其他请求交给 Hono
		return app.fetch(req, server);
	},
	// websocket,
	websocket: io.websocket,
	// maxRequestBodySize: socketIo.maxRequestBodySize,
});
