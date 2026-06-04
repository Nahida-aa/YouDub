import fs from 'node:fs';
import { join } from 'node:path';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { REPO_ROOT } from '#/config/config.ts';
import { get_youtube_cookie } from '#/feat/settings/cookie.ts';
import {
	get_openai_settings,
	get_ytdlp_settings,
	save_openai_settings,
	save_ytdlp_settings,
} from '#/feat/settings/fn.ts';
import {
	getOpenaiModelsSchema,
	saveOpenAISettingsSchema,
} from '#/feat/settings/schema.ts';
import { zv } from '#/hono/validator.ts';
import { normalizeOpenAIBaseUrl } from '#/ml/openai/url.ts';

const app = new Hono()
	.get('/get_youtube_cookie', async (c) => {
		return c.json(await get_youtube_cookie());
	})
	.get('/get_ytdlp_settings', async (c) => {
		return c.json(await get_ytdlp_settings());
	})
	.put(
		'/save_ytdlp_settings',
		zv(
			'json',
			z.object({
				proxy_port: z.string(),
			}),
		),
		async (c) => {
			const { proxy_port } = c.req.valid('json');
			const ret = await save_ytdlp_settings(proxy_port);
			return c.json({ ok: true, data: ret });
		},
	)
	.get('/get_openai_settings', async (c) => {
		return c.json(await get_openai_settings());
	})
	.put(
		'/save_openai_settings',
		zv('json', saveOpenAISettingsSchema),
		async (c) => {
			await save_openai_settings(c.req.valid('json'));
			return c.json({ ok: true });
		},
	)
	.put('/get_openai_models', zv('json', getOpenaiModelsSchema), async (c) => {
		let { base_url, api_key } = c.req.valid('json');
		if (!api_key) {
			const settings = await get_openai_settings();
			if (!base_url) base_url = settings.base_url;
			if (!api_key) api_key = settings.api_key;
		}
		if (!api_key) {
			return c.json(
				{ msg: 'OpenAI API key is not configured.', ok: false } as const,
				400,
			);
		}

		const resp = await fetch(`${normalizeOpenAIBaseUrl(base_url)}/models`, {
			headers: { Authorization: `Bearer ${api_key}` },
		});
		if (!resp.ok) {
			return c.json(
				{
					msg: `Failed to fetch models: ${resp.statusText}`,
					ok: false,
				} as const,
				502,
			);
		}

		const data = (await resp.json()) as { data: { id: string }[] };
		const models: string[] = [...new Set(data.data.map((m: any) => m.id))];
		return c.json({ models, ok: true });
	});

export default app;
