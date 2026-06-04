import { m } from '@repo/shared/i18n/paraglide/messages';
import {
	getLocale,
	locales,
	setLocale,
} from '@repo/shared/i18n/paraglide/runtime';
import { cn } from '@repo/shared/lib/utils';
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
import { toastError } from '@repo/ui-solid/custom/toast';
import { useAppForm } from '@repo/ui-solid/form/useAppForm';
import { createForm } from '@tanstack/solid-form';
import { createQuery, useMutation } from '@tanstack/solid-query';
import { useSelector } from '@tanstack/solid-store';
import { Eye, EyeOff, RefreshCw, Settings } from 'lucide-solid';
import { createEffect, createSignal, Show } from 'solid-js';
import {
	getOpenAIModels,
	openAISettings,
	saveOpenAISettings,
	saveYtdlpSettings,
	ytdlpSettingsQ,
} from '#/feat/settings/sync.ts';
import {
	getCookieInfo,
	// getOpenAIModels,
	getOpenAISettings,
	saveCookie,
	// saveOpenAISettings,
	// saveYtdlpSettings,
} from '../lib/api';

const localeNames: Record<string, string> = {
	en: m.en?.(),
	zh: m.zh?.(),
};

type SettingsForm = {
	cookie: string;
	baseUrl: string;
	apiKey: string;
	model: string;
	translateConcurrency: string;
	proxyPort: string;
};
const defaultSettings: SettingsForm = {
	cookie: '',
	baseUrl: 'https://api.openai.com/v1',
	apiKey: '',
	model: 'gpt-4o-mini',
	translateConcurrency: '50',
	proxyPort: '',
};
const SAVED_API_KEY_MASK = '********';
const SAVED_COOKIE_SENTINEL = '__YOUDUB_SAVED_COOKIE__';
type MessageKey = 'keySaved' | 'saved';

const uniqueModels = (models: string[]) => {
	return Array.from(
		new Set(models.map((model) => model.trim()).filter(Boolean)),
	);
};
export function SettingsDialog() {
	const currentLocale = getLocale();
	const cookieQuery = createQuery(() => ({
		queryKey: ['cookie'],
		queryFn: getCookieInfo,
	}));
	const ytdlpSettingsQuery = createQuery(() => ytdlpSettingsQ);
	const openaiQuery = createQuery(() => openAISettings);
	const form = useAppForm(() => ({
		defaultValues: {
			cookie: cookieQuery.data?.exists ? m.SAVED_COOKIE_SENTINEL() : '',
			baseUrl: openaiQuery.data?.base_url ?? 'https://api.openai.com/v1',
			apiKey: openaiQuery.data?.api_key ?? '',
			model: openaiQuery.data?.model ?? 'gpt-4o-mini',
			translateConcurrency: openaiQuery.data?.translate_concurrency ?? 50,
			proxyPort: ytdlpSettingsQuery.data?.proxy_port ?? '',
		},
		onSubmit: async ({ value, formApi }) => {
			if (formApi.getFieldMeta('cookie')?.isDirty) {
				await saveCookie(
					value.cookie === m.SAVED_COOKIE_SENTINEL() ? '' : value.cookie,
				);
			}
			const result = await saveOpenAISettings({
				base_url: value.baseUrl,
				api_key: value.apiKey,
				model: value.model,
				translate_concurrency: value.translateConcurrency,
			});
			const ytdlp = await saveYtdlpSettings(value.proxyPort);
			console.log('已保存');
		},
	}));
	const store = useSelector(form.store, (s) => s.values);
	const [modelOptions, setModelOptions] = createSignal<string[]>([
		'gpt-4o-mini',
	]);
	const [translateConcurrency, setTranslateConcurrency] = createSignal('50');
	const getOpenAIModelsMut = useMutation(() => ({
		mutationFn: getOpenAIModels,
		onSuccess: (data) => {
			const models = uniqueModels([store().model, ...data.models]);
			setModelOptions(models);
			console.log(
				data.models.length
					? `加载了 ${data.models.length} 个模型`
					: '未找到模型',
			);
		},
		onError: (err) => {
			console.log(err instanceof Error ? err.message : '加载模型失败');
			toastError(err);
		},
	}));

	return (
		<Dialog>
			<DialogTrigger
				class={cn(
					buttonVariants({
						variant: 'outline',
					}),
				)}
			>
				<Settings class="size-4" />
				{m.settings_button()}
			</DialogTrigger>
			<DialogContent size="2xl" showCloseButton>
				<form.AppForm>
					<form.Form
						onSubmit={form.handleSubmit}
						class="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col"
					>
						<DialogHeader class="shrink-0 pr-8">
							<DialogTitle>设置</DialogTitle>
							<DialogDescription>
								配置 OpenAI 兼容 API、代理和 YouTube Cookie
							</DialogDescription>
						</DialogHeader>
						<div class="mt-4 min-h-0 overflow-y-auto pr-1">
							<div class="grid gap-4 pb-4">
								<form.AppField
									name="cookie"
									children={(field) => (
										<field.TextareaField
											title="YouTube Cookie"
											placeholder="粘贴 Netscape 格式的 YouTube Cookie"
											class="min-h-44 overflow-auto"
										/>
									)}
								/>
								<form.AppField
									name="proxyPort"
									children={(field) => (
										<field.InputField title="代理端口" placeholder="7890" />
									)}
								/>
								<form.AppField
									name="baseUrl"
									children={(field) => (
										<field.InputField
											title="API Base URL"
											placeholder="https://api.openai.com/v1"
										/>
									)}
								/>

								<form.AppField
									name="apiKey"
									children={(field) => (
										<field.PasswordField title="API Key" placeholder="sk-..." />
									)}
								/>

								<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
									<form.AppField
										name="model"
										children={(field) => (
											<field.SelectField options={modelOptions()} />
										)}
									/>
									{/* <div class="grid gap-2">
										<Label for="model">模型</Label>
										<Input
											id="model"
											value={model()}
											onInput={(e) => setModel(e.currentTarget.value)}
											placeholder="gpt-4o-mini"
										/>
									</div> */}
									<div class="grid gap-2 sm:self-end">
										<Button
											type="button"
											variant="secondary"
											onClick={() =>
												getOpenAIModelsMut.mutate({
													base_url: store().baseUrl,
													api_key: store().apiKey,
												})
											}
											disabled={
												getOpenAIModelsMut.isPending || !store().baseUrl.trim()
											}
										>
											<RefreshCw class="size-4" />
											{getOpenAIModelsMut.isPending
												? '加载中...'
												: '获取模型列表'}
										</Button>
									</div>
								</div>
								<div class="grid gap-2">
									<Label for="translateConcurrency">翻译并发数</Label>
									<Input
										id="translateConcurrency"
										type="number"
										value={translateConcurrency()}
										onInput={(e) =>
											setTranslateConcurrency(
												e.currentTarget.value.replace(/[^0-9]/g, ''),
											)
										}
										placeholder="50"
									/>
									<p class="text-xs text-muted-foreground">
										同时发送的翻译请求数量，根据 API 速率限制调整（推荐 10-50）
									</p>
								</div>
							</div>
						</div>
						<DialogFooter class="shrink-0">
							<form.SubmitButton label="保存" />
						</DialogFooter>
					</form.Form>
				</form.AppForm>
			</DialogContent>
		</Dialog>
	);
}
