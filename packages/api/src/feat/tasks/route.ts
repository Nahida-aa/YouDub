import fs from 'node:fs';
import { join } from 'node:path';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { REPO_ROOT } from '#/config/config.ts';

const app = new Hono();

app.get(
	'/finalVideoUrl',
	zValidator(
		'query',
		z.object({
			final_video_path: z.string(),
		}),
	),
	async (c) => {
		const final_video_path = c.req.valid('query').final_video_path;
		const videoBuffer = fs.readFileSync(join(REPO_ROOT, final_video_path));
		return c.body(videoBuffer, 200, {
			'Content-Type': 'video/mp4',
		});
	},
);

export default app;
