// import { websocket } from 'hono/bun';
import { engine } from '#/socket.io/route.ts';

// import { io } from '#/ws/route.ts';
const io = engine.handler();

import app from './app';

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
