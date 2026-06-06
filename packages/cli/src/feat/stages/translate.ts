import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { env, readEnginesConfig } from '@repo/config';
import { readTaskLanguages, translationFilePath, emitLog, nowISO, updateStageDB, LANG_NAMES } from './utils.ts';

export async function stageTranslate(taskId: string, sessionPath: string) {
  const metadataDir = join(sessionPath, 'metadata');

  // 从 stages.translate.targetLang 覆盖目标语言
  const localInfoPath = join(metadataDir, 'local_info.json');
  try {
    const info = JSON.parse(readFileSync(localInfoPath, 'utf-8'));
    const stageLang = info.stages?.translate?.targetLang;
    if (stageLang) {
      info.target_language = stageLang;
      writeFileSync(localInfoPath, JSON.stringify(info, null, 2));
    }
  } catch { /* ignore */ }

  const fixedFile = join(metadataDir, 'asr_fixed.json');
  const { asrLanguage: srcLangCode, targetLanguage: dstLangCode } = readTaskLanguages(sessionPath);
  const translationFile = translationFilePath(sessionPath, dstLangCode);
  const srcLangName = LANG_NAMES[srcLangCode] || srcLangCode;
  const dstLangName = LANG_NAMES[dstLangCode] || dstLangCode;

  if (existsSync(translationFile) && existsSync(fixedFile) && statSync(fixedFile).mtimeMs <= statSync(translationFile).mtimeMs) {
    await updateStageDB(taskId, 'translate', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Already translated' });
    return;
  }

  const data = JSON.parse(readFileSync(fixedFile, 'utf-8'));
  const utterances = data.result.utterances;
  const texts = utterances.map((u: any) => (u.text || '').trim());
  const fullText = (data.result.text || '').trim() || texts.join(' ');

  let meta: any = {};
  try {
    meta = JSON.parse(readFileSync(join(metadataDir, 'ytdlp_info.json'), 'utf-8'));
  } catch { /* ignore */ }

  const enginesCfg = readEnginesConfig();
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const api = { baseUrl: enginesCfg.translate.apiBase, apiKey, model: enginesCfg.translate.model, translateConcurrency: env.OPENAI_TRANSLATE_CONCURRENCY };

  const metaView = {
    title: (meta.title || '').trim().slice(0, 500) || '(unknown)',
    uploader: (meta.uploader || '').trim().slice(0, 200) || '(unknown)',
    description: (meta.description || '').trim().slice(0, 500) || '(none)',
  };

  const preprocessPrompt = `你为视频字幕翻译做预处理。请阅读视频元信息和完整转录文本，输出 JSON。
转录原始语言：${srcLangName}
目标译文语言：${dstLangName}

# 输出 JSON 格式（严格遵守）
{
  "summary": "<中文写的视频摘要，3-5 句>",
  "hotwords": [
    {"src": "<原文术语>", "dst": "<目标语言推荐译法>"}
  ],
  "corrections": [
    {"wrong": "<转录中明显错认的写法>", "correct": "<正确写法>"}
  ]
}

# 视频元信息
标题：${metaView.title}
作者：${metaView.uploader}
描述：${metaView.description}

# 转录文本
${fullText.slice(0, 10000)}`;

  async function callJson(system: string, user: string): Promise<any> {
    const resp = await fetch(api.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
      body: JSON.stringify({
        model: api.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI API ${resp.status}: ${await resp.text()}`);
    const json = await resp.json();
    const raw = json.choices?.[0]?.message?.content || '{}';
    try { return JSON.parse(raw); } catch {
      const m = raw.match(/\{.*\}/s);
      if (m) return JSON.parse(m[0]);
      throw new Error(`Failed to parse JSON from LLM response: ${raw.slice(0, 300)}`);
    }
  }

  let summary = '', hotwords: string[] = [], corrections: string[] = [];
  try {
    const pre = await callJson('You output strict JSON only.', preprocessPrompt);
    summary = pre.summary || '';
    hotwords = (pre.hotwords || []).map((h: any) => `${h.src} -> ${h.dst}`);
    corrections = (pre.corrections || []).map((c: any) => `${c.wrong} -> ${c.correct}`);
  } catch (e: any) {
    emitLog(taskId, `[WARN] [Translate] Preprocess failed: ${e.message}`);
  }

  const hotwordsStr = hotwords.length ? hotwords.join('\n') : '(none)';
  const correctionsStr = corrections.length ? corrections.join('\n') : '(none)';

  const translateSystem = `你是一个专业的${dstLangName}翻译助手。请将${srcLangName}逐句翻译成${dstLangName}。

# 元信息
视频标题：${metaView.title}
作者：${metaView.uploader}
描述：${metaView.description}
摘要：${summary || '(none)'}

# 翻译热词
${hotwordsStr}

# ASR 纠错
${correctionsStr}

# 规则
1) 准确自然。忠实传达原意，口语保持口语感，书面保持克制；避免直译腔与过度文学化；不擅自增删信息。
2) 逐句对齐。一句对一句。
3) 人名、地名、品牌、型号、缩写默认保留；文件名、路径、URL 一律保留原样。
4) 使用中文标点；破折号禁用，改用逗号或括号。
5) 输出格式：{"dst": "<对应中文译文>"}`;

  async function translateSentence(text: string, attempt = 0): Promise<string> {
    try {
      const data = await callJson(translateSystem, text);
      if (!data.dst?.trim()) throw new Error('empty dst');
      return (data.dst as string).trim();
    } catch (e: any) {
      if (attempt < 2) return translateSentence(text, attempt + 1);
      throw new Error(`Translate failed for "${text.slice(0, 40)}": ${e.message}`);
    }
  }

  const concurrency = Math.min(api.translateConcurrency, 50);
  const dsts: string[] = [];
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((t: string) => translateSentence(t)));
    dsts.push(...results);
    await updateStageDB(taskId, 'translate', { last_message: `Translating ${Math.min(i + concurrency, texts.length)}/${texts.length}...` });
  }

  const translation = utterances.map((u: any, idx: number) => ({
    src: texts[idx],
    dst: dsts[idx]?.replace(/——/g, '，') || '',
    src_lang: srcLangCode,
    dst_lang: dstLangCode,
    start_time: u.start_time,
    end_time: u.end_time,
    speaker: '1',
  }));

  writeFileSync(translationFile, JSON.stringify({ translation }, null, 2));
  await updateStageDB(taskId, 'translate', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Translated' });
}
