import { join } from 'node:path';
import { REPO_ROOT } from '#/config/utils.ts';

export { REPO_ROOT };

export const DATA_DIR = join(REPO_ROOT, 'data');
export const COOKIE_DIR = join(DATA_DIR, 'cookies');
export const YOUTUBE_COOKIE_PATH = join(COOKIE_DIR, 'youtube_cookie.txt');
