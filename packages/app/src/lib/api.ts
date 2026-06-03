import { socket } from '#/components/socket/ws.ts';

const API_BASE =
	(import.meta as Record<string, any>).env?.VITE_API_BASE_URL ?? '';

export interface TaskStage {
	task_id: string;
	name: string;
	label: string;
	status: string;
	started_at: string | null;
	completed_at: string | null;
	last_message: string | null;
	error_message: string | null;
}

export interface Task {
	id: string;
	url: string;
	title: string | null;
	status: string;
	current_stage: string | null;
	session_path: string | null;
	final_video_path: string | null;
	error_message: string | null;
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
	stages: TaskStage[];
}

export interface TaskSummary {
	id: string;
	url: string;
	title: string | null;
	status: string;
	current_stage: string | null;
	created_at: string;
}

export interface CookieInfo {
	exists: boolean;
	size: number;
	updated_at: number | null;
	content: string;
}

export interface OpenAISettings {
	base_url: string;
	api_key: string;
	has_api_key: boolean;
	model: string;
	translate_concurrency: string;
}

export interface OpenAISettingsUpdate {
	base_url: string;
	api_key: string;
	model: string;
	translate_concurrency: string;
	clear_api_key?: boolean;
}

export interface OpenAIModels {
	models: string[];
}

export interface YtdlpSettings {
	proxy_port: string;
}

export type LocalDirection = 'en-zh' | 'zh-en';

const createRequestFn =
	({
		method = 'GET',
		baseUrl,
	}: {
		baseUrl?: string;
		method?: 'GET' | 'POST' | 'PUT';
	}) =>
	async <T>(path: string, options?: RequestInit): Promise<T> => {
		const url = `${baseUrl}${path}`;
		const res = await fetch(url, {
			method,
			...options,
			headers: {
				'Content-Type': 'application/json',
				...options?.headers,
			},
			cache: 'no-store',
		});

		if (!res.ok) {
			// 错误信息也可能是 text 或者 json
			const isJson = res.headers
				.get('Content-Type')
				?.includes('application/json');
			const body = isJson ? await res.json().catch(() => null) : null;
			const textDetail = !isJson ? await res.text().catch(() => null) : null;
			throw new Error(body?.detail ?? textDetail ?? `HTTP ${res.status}`);
		}
		if (res.status === 204) return undefined as T;
		// 👇 根据 Content-Type 动态决定解析方式
		const contentType = res.headers.get('Content-Type') || '';
		if (contentType.includes('application/json')) {
			return res.json() as Promise<T>;
		} else {
			return res.text() as unknown as Promise<T>;
		}
	};
const request = createRequestFn({ baseUrl: API_BASE });

export function listTasks(limit = 100): Promise<{ tasks: TaskSummary[] }> {
	return request(`/api/tasks?limit=${limit}`);
}

export function getTask(id: string): Promise<Task> {
	return request(`/api/tasks/${id}`);
}

export function getTaskLog(id: string): Promise<string> {
	return request(`/api/tasks/${id}/log`);
}

export function deleteTask(id: string): Promise<void> {
	return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

export function rerunTask(id: string): Promise<Task> {
	return request(`/api/tasks/${id}/rerun`, { method: 'POST' });
}

export function resumeTask(id: string): Promise<Task> {
	return request(`/api/tasks/${id}/resume`, { method: 'POST' });
}

export function rerunStage(
	id: string,
	stage: string,
	cascade = false,
): Promise<Task> {
	return request(`/api/tasks/${id}/rerun-stage`, {
		method: 'POST',
		body: JSON.stringify({ stage, cascade }),
	});
}

export function createTask(url: string): Promise<Task> {
	return request(`/api/tasks`, {
		method: 'POST',
		body: JSON.stringify({ url }),
	});
}

export function uploadLocalTask(
	file: File,
	direction: LocalDirection,
): Promise<Task> {
	const form = new FormData();
	form.append('file', file);
	form.append('direction', direction);
	return fetch(`${API_BASE}/api/tasks/upload`, {
		method: 'POST',
		body: form,
	}).then(async (res) => {
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			throw new Error(body?.detail ?? `HTTP ${res.status}`);
		}
		return res.json() as Promise<Task>;
	});
}

export interface TaskDescription {
	src: string;
	dst: string;
}

export function getTaskDescription(id: string): Promise<TaskDescription> {
	return request(`/api/tasks/${id}/description`);
}

export function translateTaskDescription(id: string): Promise<TaskDescription> {
	return request(`/api/tasks/${id}/translate-description`, { method: 'POST' });
}

export function finalVideoUrl(id: string): string {
	return `${API_BASE}/api/tasks/${id}/artifact/final-video`;
}

export function finalVideoDownloadUrl(id: string): string {
	return `${API_BASE}/api/tasks/${id}/artifact/final-video?download=1`;
}

export function getCookieInfo(): Promise<CookieInfo> {
	return request('/api/cookies/youtube');
}

export const saveCookie = async (content: string) => {
	return await socket.emitWithAck('save_youtube_cookie', content);
	// return request('/api/cookies/youtube', {
	// 	method: 'POST',
	// 	body: JSON.stringify({ content }),
	// });
};

export function getOpenAISettings(): Promise<OpenAISettings> {
	return request('/api/settings/openai');
}

export function saveOpenAISettings(
	settings: OpenAISettingsUpdate,
): Promise<OpenAISettings> {
	return request('/api/settings/openai', {
		method: 'POST',
		body: JSON.stringify(settings),
	});
}

export function getOpenAIModels(settings: {
	base_url: string;
	api_key: string;
}): Promise<OpenAIModels> {
	return request('/api/settings/openai/models', {
		method: 'POST',
		body: JSON.stringify(settings),
	});
}

export function getYtdlpSettings(): Promise<YtdlpSettings> {
	return request('/api/settings/ytdlp');
}

export function saveYtdlpSettings(
	settings: YtdlpSettings,
): Promise<YtdlpSettings> {
	return request('/api/settings/ytdlp', {
		method: 'POST',
		body: JSON.stringify(settings),
	});
}
