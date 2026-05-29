import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { REPO_ROOT } from '#/config/utils.ts';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

loadEnv({ path: resolve(repoRoot, '.env') });

export const env = {
	DB_FILE_NAME: resolve(
		REPO_ROOT,
		process.env.DB_FILE_NAME ?? 'data/youdub.sqlite',
	),
};
