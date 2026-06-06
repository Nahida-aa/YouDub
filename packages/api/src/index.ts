import { engine } from '#/socket.io/route.ts';
import { start } from '#/feat/tasks/worker.ts';
import { runPipeline } from '#/feat/tasks/pipeline-runner.ts';
import { ensureRuntimeDirs } from '#/config/config.ts';

ensureRuntimeDirs();

const io = engine.handler();

import app from './app';

// Register the pipeline runner on startup
start(runPipeline);
console.log('[Pipeline] Runner registered');

export default Bun.serve({
	port: 9007,
	idleTimeout: 60,

	fetch(req: Request, server: any) {
		if (req.url.includes('/ws/')) {
			return io.fetch(req, server);
		}
		return app.fetch(req, server);
	},
	websocket: io.websocket,
});
