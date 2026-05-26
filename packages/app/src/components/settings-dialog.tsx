import { createSignal, createEffect, Show } from 'solid-js';
import { Settings, Eye, EyeOff, RefreshCw } from 'lucide-solid';
import { Button, buttonVariants } from '@repo/ui-solid/base/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@repo/ui-solid/base/dialog';
// #/components/base/dialog.tsx
import { Input } from '@repo/ui-solid/base/input';
import { Label } from '@repo/ui-solid/base/label';
import { Textarea } from '@repo/ui-solid/base/textarea';
import {
	getCookieInfo,
	getOpenAIModels,
	getOpenAISettings,
	getYtdlpSettings,
	saveCookie,
	saveOpenAISettings,
	saveYtdlpSettings,
} from '../lib/api';

import { m } from '@repo/shared/i18n/paraglide/messages';
import { getLocale ,locales, setLocale } from '@repo/shared/i18n/paraglide/runtime';
import { createForm } from '@tanstack/solid-form';
import { useAppForm } from '@repo/ui-solid/form/useAppForm';
import { cn } from '@repo/shared/lib/utils';

	const localeNames: Record<string, string> = {
		en: m.en?.(),
		zh: m.zh?.(),
	};

	type SettingsForm = {
  cookie: string
  baseUrl: string
  apiKey: string
  model: string
  translateConcurrency: string
  proxyPort: string
}
	const defaultSettings: SettingsForm = {
  cookie: "",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  translateConcurrency: "50",
  proxyPort: "",
}
const SAVED_API_KEY_MASK = '********';
const SAVED_COOKIE_SENTINEL = '__YOUDUB_SAVED_COOKIE__';
type MessageKey = "keySaved" | "saved"

const uniqueModels = (models: string[]) => {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)))
}
export function SettingsDialog() {
	const currentLocale = getLocale();
	const [open, setOpen] = createSignal(false);
	const form = useAppForm(() => ({
		defaultValues: defaultSettings,
		onSubmit: async ({value}) => {
			setMessage('');
		try {
			if (cookieDirty()) {
				await saveCookie(cookie() === SAVED_COOKIE_SENTINEL ? '' : cookie());
			}
			const clearApiKey = apiKeyDirty() && !apiKey().trim();
			const result = await saveOpenAISettings({
				base_url: baseUrl(),
				api_key: apiKeyDirty() ? apiKey() : '',
				clear_api_key: clearApiKey,
				model: model(),
				translate_concurrency: translateConcurrency(),
			});
			const ytdlp = await saveYtdlpSettings({ proxy_port: proxyPort() });
			setMessage('已保存');
			setApiKey(result.has_api_key ? result.api_key || SAVED_API_KEY_MASK : '');
			setTranslateConcurrency(result.translate_concurrency || translateConcurrency());
			setProxyPort(ytdlp.proxy_port);
			setCookieDirty(false);
			setApiKeyDirty(false);
		} catch (err) {
			setMessage(err instanceof Error ? err.message : '保存失败');
		}
		}
	}))
	const [cookie, setCookie] = createSignal('');
	const [cookieDirty, setCookieDirty] = createSignal(false);
	const [baseUrl, setBaseUrl] = createSignal('https://api.openai.com/v1');
	const [apiKey, setApiKey] = createSignal('');
	const [apiKeyDirty, setApiKeyDirty] = createSignal(false);
	const [model, setModel] = createSignal('gpt-4o-mini');
	const [translateConcurrency, setTranslateConcurrency] = createSignal('50');
	const [proxyPort, setProxyPort] = createSignal('');
	const [message, setMessage] = createSignal('');
	const [modelsLoading, setModelsLoading] = createSignal(false);
	const [showApiKey, setShowApiKey] = createSignal(false);

	const cookieValue = () =>
		cookie() === SAVED_COOKIE_SENTINEL ? '已保存 Cookie（点击可修改）' : cookie();

	createEffect(() => {
		if (!open()) return;
		Promise.all([getCookieInfo(), getOpenAISettings(), getYtdlpSettings()])
			.then(([ck, openai, ytdlp]) => {
				setCookie(ck.exists ? SAVED_COOKIE_SENTINEL : '');
				setBaseUrl(openai.base_url);
				setApiKey(openai.has_api_key ? openai.api_key || SAVED_API_KEY_MASK : '');
				setModel(openai.model);
				setTranslateConcurrency(openai.translate_concurrency || '50');
				setProxyPort(ytdlp.proxy_port);
				
				setShowApiKey(false);
				setCookieDirty(false);
				setApiKeyDirty(false);
				setMessage(openai.has_api_key ? '密钥已保存' : '');
			})
			.catch((err) => {
				setMessage(err instanceof Error ? err.message : '加载设置失败');
			});
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		setMessage('');
		try {
			if (cookieDirty()) {
				await saveCookie(cookie() === SAVED_COOKIE_SENTINEL ? '' : cookie());
			}
			const clearApiKey = apiKeyDirty() && !apiKey().trim();
			const result = await saveOpenAISettings({
				base_url: baseUrl(),
				api_key: apiKeyDirty() ? apiKey() : '',
				clear_api_key: clearApiKey,
				model: model(),
				translate_concurrency: translateConcurrency(),
			});
			const ytdlp = await saveYtdlpSettings({ proxy_port: proxyPort() });
			setMessage('已保存');
			setApiKey(result.has_api_key ? result.api_key || SAVED_API_KEY_MASK : '');
			setTranslateConcurrency(result.translate_concurrency || translateConcurrency());
			setProxyPort(ytdlp.proxy_port);
			setCookieDirty(false);
			setApiKeyDirty(false);
		} catch (err) {
			setMessage(err instanceof Error ? err.message : '保存失败');
		}
	}

	async function handleFetchModels() {
		setMessage('');
		setModelsLoading(true);
		try {
			const response = await getOpenAIModels({
				base_url: baseUrl(),
				api_key: apiKeyDirty() ? apiKey() : '',
			});
			if (response.models.length > 0) {
				setModel(response.models[0]);
			}
			setMessage(response.models.length ? `加载了 ${response.models.length} 个模型` : '未找到模型');
		} catch (err) {
			setMessage(err instanceof Error ? err.message : '加载模型失败');
		} finally {
			setModelsLoading(false);
		}
	}

	return (
		<Dialog >
			<DialogTrigger class={cn(buttonVariants({ variant: 'outline', class: 'bg-red-400' }))}>
					<Settings class="size-4" />
					{m.settings_button()}
			</DialogTrigger>
			<DialogContent size="2xl" showCloseButton>
				<form.AppForm>
					<form.Form onSubmit={form.handleSubmit} class="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
					<DialogHeader class="shrink-0 pr-8">
						<DialogTitle>设置</DialogTitle>
						<DialogDescription>配置 OpenAI 兼容 API、代理和 YouTube Cookie</DialogDescription>
					</DialogHeader>
					<div class="mt-4 min-h-0 overflow-y-auto pr-1">
						<div class="grid gap-4 pb-4">
							<div class="grid gap-2">
								<Label for="proxyPort">代理端口</Label>
								<Input
									id="proxyPort"
									type="number"
									value={proxyPort()}
									onInput={(e) => setProxyPort(e.currentTarget.value)}
									placeholder="7890"
								/>
							</div>
							<div class="grid gap-2">
								<Label for="cookie">YouTube Cookie</Label>
								<Textarea
									id="cookie"
									value={cookieValue()}
									onFocus={(e) => {
										if (!cookieDirty() && cookie() === SAVED_COOKIE_SENTINEL) {
											e.currentTarget.select();
										}
									}}
									onInput={(e) => {
										setCookieDirty(true);
										setCookie(
											cookie() === SAVED_COOKIE_SENTINEL
												? e.currentTarget.value.replace('已保存 Cookie（点击可修改）', '')
												: e.currentTarget.value,
										);
									}}
									placeholder="粘贴 Netscape 格式的 YouTube Cookie"
									class="min-h-44 max-h-[42dvh] overflow-auto font-mono text-xs leading-relaxed"
								/>
							</div>
							<div class="grid gap-2">
								<Label for="baseUrl">API Base URL</Label>
								<Input
									id="baseUrl"
									value={baseUrl()}
									onInput={(e) => setBaseUrl(e.currentTarget.value)}
									placeholder="https://api.openai.com/v1"
								/>
							</div>
							<div class="grid gap-2">
								<Label for="apiKey">API Key</Label>
								<div class="relative">
									<Input
										id="apiKey"
										type={showApiKey() ? 'text' : 'password'}
										value={apiKey()}
										onFocus={(e) => {
											if (!apiKeyDirty() && apiKey() === SAVED_API_KEY_MASK) {
												e.currentTarget.select();
											}
										}}
										onInput={(e) => {
											setApiKeyDirty(true);
											setApiKey(e.currentTarget.value.replace(SAVED_API_KEY_MASK, ''));
										}}
										placeholder="sk-..."
										class="pr-9"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										class="absolute top-0 right-0"
										onClick={() => setShowApiKey((v) => !v)}
									>
										<Show when={showApiKey()} fallback={<Eye class="size-4" />}>
											<EyeOff class="size-4" />
										</Show>
									</Button>
								</div>
							</div>
							<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
								<div class="grid gap-2">
									<Label for="model">模型</Label>
									<Input
										id="model"
										value={model()}
										onInput={(e) => setModel(e.currentTarget.value)}
										placeholder="gpt-4o-mini"
									/>
								</div>
								<div class="grid gap-2 sm:self-end">
									<Button
										type="button"
										variant="secondary"
										onClick={handleFetchModels}
										disabled={modelsLoading() || !baseUrl().trim()}
									>
										<RefreshCw class="size-4" />
										{modelsLoading() ? '加载中...' : '获取模型列表'}
									</Button>
								</div>
							</div>
							<div class="grid gap-2">
								<Label for="translateConcurrency">翻译并发数</Label>
								<Input
									id="translateConcurrency"
									type="number"
									value={translateConcurrency()}
									onInput={(e) => setTranslateConcurrency(e.currentTarget.value.replace(/[^0-9]/g, ''))}
									placeholder="50"
								/>
								<p class="text-xs text-muted-foreground">
									同时发送的翻译请求数量，根据 API 速率限制调整（推荐 10-50）
								</p>
							</div>
							<Show when={message()}>
								<p class="text-sm text-muted-foreground">{message()}</p>
							</Show>
						</div>
					</div>
					<DialogFooter class="shrink-0">
						<Button type="submit">保存</Button>
					</DialogFooter>
					</form.Form>
				</form.AppForm>

			</DialogContent>
		</Dialog>
	);
}
