import { runPipeline } from '../api/src/feat/tasks/pipeline-runner.ts';

const taskId = process.argv[2];
if (!taskId) {
	console.error('Usage: bun run-task.ts <taskId>');
	process.exit(1);
}

console.log(`[CLI] Starting pipeline for task ${taskId}...`);
(async () => {
	try {
		await runPipeline(taskId);
		console.log('[CLI] Pipeline completed');
	} catch (err) {
		console.error('[CLI] Pipeline failed:', err);
		process.exit(1);
	}
})();
