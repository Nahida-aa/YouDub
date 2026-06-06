import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { db } from './../../db/index.ts';
import { eq, sql } from 'drizzle-orm';
import { tasks, taskStages } from './../../feat/tasks/table.ts';
import { STAGES } from './../../feat/tasks/stages.ts';
import { extractVideoId, isYouTubeUrl } from './../../feat/tasks/validate.ts';
import { sanitizeText } from './../../feat/tasks/fn.ts';
import { LOG_DIR, WORKFOLDER, openaiDefaults, REPO_ROOT, YOUTUBE_COOKIE_PATH } from './../../config/config.ts';
import { env } from './../../config/env.ts';
import { Demucs } from './../../ml/demucs/demucs.ts';
import { VoxCPM } from './../../ml/voxcpm/voxcpm.ts';

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function broadcastUpdate(_table: string, _mutations: any[]) {
  // CLI 模式下不发送 socket 事务
}

async function updateTaskDB(taskId: string, fields: Record<string, unknown>) {
  if (Object.keys(fields).length === 0) return;
  await db.update(tasks).set(fields).where(eq(tasks.id, taskId));
  broadcastUpdate('tasks', [{ type: 'update', id: taskId, data: fields as any }]);
}

async function updateStageDB(taskId: string, name: string, fields: Record<string, unknown>) {
  if (Object.keys(fields).length === 0) return;
  await db
    .update(taskStages)
    .set(fields)
    .where(sql`${taskStages.task_id} = ${taskId} AND ${taskStages.name} = ${name}`);
  broadcastUpdate('task_stages', [{ type: 'update', id: `${taskId}_${name}`, data: { task_id: taskId, name, ...fields } as any }]);
}

// ── Helpers ──
function srtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ml = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ml).padStart(3, '0')}`;
}

function emitLog(taskId: string, line: string) {
  console.log(line);
  const ts = nowISO();
  const logPath = join(LOG_DIR, `${taskId}.log`);
  appendFileSync(logPath, `[${ts}] ${line}\n`);
  // CLI 模式下不发送 socket 事件
}

function ffmpeg(args: string[], timeout = 120_000) {
  const r = spawnSync('ffmpeg', ['-y', ...args], { stdio: ['pipe', 'pipe', 'pipe'], timeout });
  if (r.error) throw new Error(`ffmpeg: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg exit ${r.status}: ${r.stderr.toString().slice(0, 300)}`);
}

// ── Stage 1: download ──
async function stageDownload(taskId: string, sessionPath: string, url: string) {
  let mediaDir = join(sessionPath, 'media');
  let videoPath = join(mediaDir, 'video_source.mp4');

  // If video already exists on disk, skip download entirely
  if (existsSync(videoPath)) {
    await updateStageDB(taskId, 'download', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Already on disk' });
    return;
  }

  // Local upload URL (local://upload/<uploadTaskId>?direction=...&filename=...)
  if (url.startsWith('local://')) {
    await updateStageDB(taskId, 'download', { last_message: 'Importing local video...', progress: 0 });
    mkdirSync(mediaDir, { recursive: true });
    mkdirSync(join(sessionPath, 'metadata'), { recursive: true });

    const parsed = new URL(url);
    const uploadTaskId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
    const direction = parsed.searchParams.get('direction') || 'en-zh';
    const filename = parsed.searchParams.get('filename') || 'video.mp4';

    const uploadDir = join(WORKFOLDER, '_uploads', uploadTaskId);
    const sourceFile = join(uploadDir, filename);
    if (!existsSync(sourceFile)) throw new Error(`Local upload file not found: ${sourceFile}`);

    // Transcode to MP4 via ffmpeg
    ffmpeg(['-i', sourceFile, '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-movflags', '+faststart', videoPath]);

    if (!existsSync(videoPath)) throw new Error('ffmpeg did not produce video_source.mp4');

    const [srcLang, tgtLang] = direction.split('-');
    writeFileSync(join(sessionPath, 'metadata', 'local_info.json'), JSON.stringify({
      id: uploadTaskId,
      title: filename.replace(/\.\w+$/, ''),
      source: 'local',
      webpage_url: url,
      original_path: sourceFile,
      asr_language: srcLang,
      target_language: tgtLang,
    }, null, 2));

    await updateStageDB(taskId, 'download', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Imported' });
    return;
  }

  // YouTube/Bilibili URL — download via yt-dlp
  let isDownloadable = false;
  try { isDownloadable = !!extractVideoId(url); } catch { /* not a yt/bili url */ }
  if (!isDownloadable) {
    throw new Error(`Cannot download: unsupported URL "${url}". Use a YouTube/Bilibili URL or upload a local file.`);
  }

  const isYT = isYouTubeUrl(url);
  const authArgs: string[] = [];
  if (isYT && existsSync(YOUTUBE_COOKIE_PATH)) authArgs.push('--cookies', YOUTUBE_COOKIE_PATH);
  if (isYT && env.YTDLP_PROXY_PORT) authArgs.push('--proxy', `http://127.0.0.1:${env.YTDLP_PROXY_PORT}`);

  // 1. Get metadata first to compute structured session path (like Python)
  let resolvedSession = sessionPath;
  try {
    const infoArgs = ['--dump-json', ...authArgs, url];
    const infoR = spawnSync('yt-dlp', infoArgs, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 });
    if (infoR.status === 0 && infoR.stdout.length > 0) {
      const info = JSON.parse(infoR.stdout.toString());
      const uploader = sanitizeText(info.uploader || '', 'unknown');
      const title = sanitizeText(info.title || '', 'untitled');
      const videoId = info.id || extractVideoId(url);
      resolvedSession = join(WORKFOLDER, uploader, `${title}__${videoId}`);

      // Save metadata early
      mkdirSync(join(resolvedSession, 'metadata'), { recursive: true });
      writeFileSync(join(resolvedSession, 'metadata', 'ytdlp_info.json'), infoR.stdout);

      // Update DB with relative path (matching Python convention)
      await updateTaskDB(taskId, { session_path: relative(REPO_ROOT, resolvedSession) });
    }
  } catch { /* fall back to flat path */ }

  mediaDir = join(resolvedSession, 'media');
  videoPath = join(mediaDir, 'video_source.mp4');

  await updateStageDB(taskId, 'download', { last_message: 'Downloading video...', progress: 0 });
  mkdirSync(mediaDir, { recursive: true });
  mkdirSync(join(resolvedSession, 'metadata'), { recursive: true });

  const ytArgs: string[] = [
    '-f', 'bestaudio[ext=m4a]+bestvideo[ext=mp4]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', join(mediaDir, 'video_source.%(ext)s'),
    ...authArgs,
    url,
  ];

  const r = spawnSync('yt-dlp', ytArgs, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 300_000 });

  const dlErr = r.error;
  if (dlErr) throw new Error(`yt-dlp: ${dlErr.message}`);
  if (r.status !== 0) throw new Error(`yt-dlp exit ${r.status}: ${r.stderr.toString().slice(0, 200)}`);

  if (!existsSync(videoPath)) throw new Error('yt-dlp did not produce video_source.mp4');

  await updateStageDB(taskId, 'download', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Downloaded' });
}

// ── Stage 2: separate (Demucs) ──
async function stageSeparate(taskId: string, sessionPath: string) {
  await updateStageDB(taskId, 'separate', { last_message: 'Separating audio...', progress: 0 });

  const videoPath = join(sessionPath, 'media', 'video_source.mp4');
  if (!existsSync(videoPath)) throw new Error('video_source.mp4 not found');

  const demucs = new Demucs();
  await demucs.load();

  // Extract audio as WAV 44.1kHz stereo for Demucs
  const audioPath = join(sessionPath, 'tmp', 'audio_source.wav');
  mkdirSync(dirname(audioPath), { recursive: true });
  ffmpeg(['-i', videoPath, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', audioPath]);

  const stems = await demucs.separate(audioPath);

  const mediaDir = join(sessionPath, 'media');
  demucs.writeWav(stems.vocals, stems.sampleRate, join(mediaDir, 'audio_vocals.wav'));

  // BGM = drums + bass + other
  const bgm = new Float32Array(stems.drums.length);
  for (let i = 0; i < bgm.length; i++) {
    bgm[i] = stems.drums[i] + stems.bass[i] + stems.other[i];
  }
  demucs.writeWav(bgm, stems.sampleRate, join(mediaDir, 'audio_bgm.wav'));

  await updateStageDB(taskId, 'separate', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Separated' });
}

// ── Stage 3: asr (faster-whisper GPU → CPU fallback) ──
async function stageAsr(taskId: string, sessionPath: string) {
  await updateStageDB(taskId, 'asr', { last_message: 'Transcribing...', progress: 0 });

  const vocalsPath = resolve(REPO_ROOT, sessionPath, 'media', 'audio_vocals.wav');
  const sessionAbsPath = resolve(REPO_ROOT, sessionPath);
  if (!existsSync(vocalsPath)) throw new Error('audio_vocals.wav not found');

  const asrScript = join(REPO_ROOT, 'packages', 'cli', 'scripts', 'asr', 'run.py');
  const pythonBin = join(REPO_ROOT, '.venv', 'bin', 'python');

  // First attempt: GPU (float16), retries on SIGSEGV/SIGABRT with --cpu
  const args = [asrScript, vocalsPath, sessionAbsPath, 'en'];

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(pythonBin, attempt === 1 ? [...args, '--cpu'] : args, {
      maxBuffer: 256 * 1024 * 1024,
      timeout: 600_000,
    });

    if (result.signal) {
      const stderr = (result.stderr?.toString() || '').trim().slice(-200);
      if (attempt === 0) {
        await updateStageDB(taskId, 'asr', { last_message: 'GPU hang, retrying CPU...' });
        continue;
      }
      throw new Error(`ASR killed by signal ${result.signal}: ${stderr}`);
    }

    if (result.error) throw new Error(`Python ASR subprocess failed: ${result.error.message}`);
    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      throw new Error(`Python ASR exited with status ${result.status}: ${stderr}`);
    }

    const asrOutputPath = result.stdout?.toString().trim();
    if (!asrOutputPath || !existsSync(asrOutputPath)) {
      throw new Error(`Python ASR did not produce output at ${asrOutputPath}`);
    }

    await updateStageDB(taskId, 'asr', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Transcribed' });
    return;
  }
}

// ── Stage 4: asr_fix ──
function fixAsrUtterances(utterances: any[], duration: number, startPad = 100, endPad = 300): any[] {
  if (!utterances.length) return utterances;
  const minGap = 50;

  const startPadAt = (idx: number): number => {
    const origStart = utterances[idx].start_time;
    if (idx === 0) return Math.max(0, origStart - startPad);
    const prevEnd = utterances[idx - 1].end_time;
    const gap = origStart - prevEnd;
    const total = startPad + endPad;
    if (gap >= total + minGap) return origStart - startPad;
    if (gap > minGap) {
      const share = Math.floor((gap - minGap) * startPad / total);
      return origStart - share;
    }
    return prevEnd + Math.floor(gap / 2);
  };

  const endPadAt = (idx: number): number => {
    const origEnd = utterances[idx].end_time;
    if (idx === utterances.length - 1) {
      return duration ? Math.min(duration, origEnd + endPad) : origEnd + endPad;
    }
    const nextStart = utterances[idx + 1].start_time;
    const gap = nextStart - origEnd;
    const total = startPad + endPad;
    if (gap >= total + minGap) return origEnd + endPad;
    if (gap > minGap) {
      const share = Math.floor((gap - minGap) * endPad / total);
      return origEnd + share;
    }
    return origEnd + Math.floor(gap / 2);
  };

  return utterances.map((u, idx) => {
    const newStart = startPadAt(idx);
    const newEnd = Math.min(duration, endPadAt(idx));
    return { ...u, start_time: Math.max(0, newStart), end_time: newEnd };
  });
}

async function stageAsrFix(taskId: string, sessionPath: string) {
  const metadataDir = join(sessionPath, 'metadata');
  const asrFile = join(metadataDir, 'asr.json');
  const fixedFile = join(metadataDir, 'asr_fixed.json');

  if (existsSync(fixedFile) && existsSync(asrFile) && statSync(asrFile).mtimeMs <= statSync(fixedFile).mtimeMs) {
    await updateStageDB(taskId, 'asr_fix', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Already fixed' });
    return;
  }

  const data = JSON.parse(readFileSync(asrFile, 'utf-8'));
  const utterances = data.result.utterances;
  const duration = data.audio_info?.duration ?? 0;

  const cleaned = utterances
    .map((u: any) => ({ text: (u.text || '').trim(), start_time: u.start_time, end_time: u.end_time }))
    .filter((u: any) => u.text);

  if (!cleaned.length) throw new Error('ASR result has no utterances.');

  const padded = fixAsrUtterances(cleaned, duration);
  writeFileSync(fixedFile, JSON.stringify({
    audio_info: data.audio_info || {},
    result: { text: data.result.text || '', utterances: padded },
  }, null, 2));

  await updateStageDB(taskId, 'asr_fix', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Fixed' });
}

// ── Stage 5: translate ──
async function stageTranslate(taskId: string, sessionPath: string) {
  const metadataDir = join(sessionPath, 'metadata');
  const fixedFile = join(metadataDir, 'asr_fixed.json');
  const translationFile = join(metadataDir, 'translation.zh.json');

  if (existsSync(translationFile) && existsSync(fixedFile) && statSync(fixedFile).mtimeMs <= statSync(translationFile).mtimeMs) {
    await updateStageDB(taskId, 'translate', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Already translated' });
    return;
  }

  const data = JSON.parse(readFileSync(fixedFile, 'utf-8'));
  const utterances = data.result.utterances;
  const texts = utterances.map((u: any) => (u.text || '').trim());
  const fullText = (data.result.text || '').trim() || texts.join(' ');

  // Read ytdlp metadata
  let meta: any = {};
  try {
    meta = JSON.parse(readFileSync(join(metadataDir, 'ytdlp_info.json'), 'utf-8'));
  } catch { /* ignore */ }

  const api = openaiDefaults();
  if (!api.apiKey) throw new Error('OPENAI_API_KEY not configured');

  const metaView = {
    title: (meta.title || '').trim().slice(0, 500) || '(unknown)',
    uploader: (meta.uploader || '').trim().slice(0, 200) || '(unknown)',
    description: (meta.description || '').trim().slice(0, 500) || '(none)',
  };

  // Preprocess: one call to get summary, hotwords, corrections
  const preprocessPrompt = `你为视频字幕翻译做预处理。请阅读视频元信息和完整转录文本，输出 JSON。
转录原始语言：English
目标译文语言：中文

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

  const translateSystem = `你是一个专业的中文翻译助手。请将英文逐句翻译成中文。

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

  // Batch translate with concurrency limit
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
    src_lang: 'en',
    dst_lang: 'zh',
    start_time: u.start_time,
    end_time: u.end_time,
    speaker: '1',
  }));

  writeFileSync(translationFile, JSON.stringify({ translation }, null, 2));
  await updateStageDB(taskId, 'translate', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Translated' });
}

// ── Stage 6: split_audio ──
async function stageSplitAudio(taskId: string, sessionPath: string) {
  const vocalsFile = join(sessionPath, 'media', 'audio_vocals.wav');
  const translationFile = join(sessionPath, 'metadata', 'translation.zh.json');

  if (!existsSync(vocalsFile)) throw new Error('audio_vocals.wav not found');
  if (!existsSync(translationFile)) throw new Error('translation.zh.json not found');

  const data = JSON.parse(readFileSync(translationFile, 'utf-8'));
  const segmentsDir = join(sessionPath, 'segments', 'vocals');
  mkdirSync(segmentsDir, { recursive: true });

  // Get total audio duration for clamping
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', vocalsFile], { stdio: ['pipe', 'pipe', 'pipe'] });
  const totalMs = Math.floor(parseFloat(probe.stdout.toString().trim()) * 1000) || 0;

  for (let i = 0; i < data.translation.length; i++) {
    const item = data.translation[i];
    const idx = String(i + 1).padStart(4, '0');
    const outPath = join(segmentsDir, `${idx}.wav`);
    if (existsSync(outPath)) continue;

    const start = Math.max(0, Math.floor(item.start_time) - 80);
    const end = Math.min(totalMs, Math.ceil(item.end_time) + 160);

    if (end <= start) {
      writeFileSync(outPath, Buffer.alloc(44)); // empty WAV header
      continue;
    }

    ffmpeg(['-i', vocalsFile, '-ss', String(start / 1000), '-to', String(end / 1000), '-c', 'copy', outPath]);
  }

  await updateStageDB(taskId, 'split_audio', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Split' });
}

// ── Stage 7: tts (VoxCPM) ──
async function stageTts(taskId: string, sessionPath: string) {
  const translationFile = resolve(REPO_ROOT, sessionPath, 'metadata', 'translation.zh.json');
  const vocalsDir = resolve(REPO_ROOT, sessionPath, 'segments', 'vocals');
  const ttsDir = resolve(REPO_ROOT, sessionPath, 'segments', 'tts');

  if (!existsSync(translationFile)) throw new Error('translation.zh.json not found');
  mkdirSync(ttsDir, { recursive: true });

  const data = JSON.parse(readFileSync(translationFile, 'utf-8'));
  const translation = data.translation;

  let fallbackRef = '';
  for (let i = 0; i < translation.length; i++) {
    const idx = String(i + 1).padStart(4, '0');
    const refPath = resolve(vocalsDir, `${idx}.wav`);
    if (existsSync(refPath) && statSync(refPath).size > 1200 * 16 * 2) {
      fallbackRef = refPath;
      break;
    }
  }

  const voxcpm = new VoxCPM(undefined, { executionProvider: 'webgpu' });
  await voxcpm.load();

  for (let i = 0; i < translation.length; i++) {
    const item = translation[i];
    const idx = String(i + 1).padStart(4, '0');
    const outPath = resolve(ttsDir, `${idx}.wav`);
    if (existsSync(outPath)) continue;

    const text = item.dst || item.zh || '';
    if (!text.trim()) {
      writeFileSync(outPath, Buffer.alloc(44));
      continue;
    }

    let refWav = resolve(vocalsDir, `${idx}.wav`);
    if (!existsSync(refWav) || statSync(refWav).size < 1200 * 16 * 2) {
      refWav = fallbackRef;
    }
    if (!refWav || !existsSync(refWav)) {
      emitLog(taskId, `[WARN] [TTS] No reference for segment ${idx}, skipping`);
      writeFileSync(outPath, Buffer.alloc(44));
      continue;
    }

    await updateStageDB(taskId, 'tts', { last_message: `Generating ${i + 1}/${translation.length}...` });

    const audio = await voxcpm.generate({ text, referenceWavPath: refWav });
    writeWav(audio, outPath, 48000);
  }

  await updateStageDB(taskId, 'tts', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'TTS done' });
}

function writeWav(samples: Float32Array, filePath: string, sampleRate: number) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32768)));
    dv.setInt16(44 + i * 2, s, true);
  }
  writeFileSync(filePath, new Uint8Array(buf));
}

// ── Stage 8: merge_audio ──
async function stageMergeAudio(taskId: string, sessionPath: string) {
  const translationFile = join(sessionPath, 'metadata', 'translation.zh.json');
  const ttsDir = join(sessionPath, 'segments', 'tts');
  const tmpDir = join(sessionPath, 'tmp');
  const stretchedDir = join(sessionPath, 'segments', 'stretched');
  const metadataDir = join(sessionPath, 'metadata');

  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(stretchedDir, { recursive: true });
  mkdirSync(metadataDir, { recursive: true });

  const dubbingFile = join(tmpDir, 'audio_dubbing.wav');
  const timingsFile = join(metadataDir, 'timings.json');
  if (existsSync(dubbingFile) && existsSync(timingsFile) && existsSync(translationFile) && statSync(translationFile).mtimeMs <= statSync(dubbingFile).mtimeMs) {
    await updateStageDB(taskId, 'merge_audio', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Already merged' });
    return;
  }

  const data = JSON.parse(readFileSync(translationFile, 'utf-8'));
  const translation = data.translation;
  const ttsFiles = translation.map((_: any, i: number) => join(ttsDir, `${String(i + 1).padStart(4, '0')}.wav`));

  for (const f of ttsFiles) {
    if (!existsSync(f)) throw new Error(`Missing TTS segment: ${f}`);
  }

  // Get sample rate from first TTS file
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', ttsFiles[0]], { stdio: ['pipe', 'pipe', 'pipe'] });
  const sampleRate = parseInt(probe.stdout.toString().trim()) || 48000;

  // Base speed factor
  let curTotal = 0, desTotal = 0;
  for (let i = 0; i < translation.length; i++) {
    const durProbe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ttsFiles[i]], { stdio: ['pipe', 'pipe', 'pipe'] });
    const dur = parseFloat(durProbe.stdout.toString().trim()) || 0;
    curTotal += dur;
    desTotal += Math.max(0, (translation[i].end_time - translation[i].start_time) / 1000);
  }
  const baseFactor = curTotal > 0
    ? Math.max(0.8, Math.min(1.2, (desTotal / curTotal) * 0.99))
    : 1.0;

  // Concatenate segments with silence gaps and speed adjustment
  const segmentInputs: string[] = [];
  let lastEndMs = 0;

  for (let i = 0; i < translation.length; i++) {
    const segment = translation[i];
    const ttsFile = ttsFiles[i];
    const idx = String(i + 1).padStart(4, '0');
    const stretchedFile = join(stretchedDir, `${idx}.wav`);

    const realStartMs = Math.max(segment.start_time, lastEndMs);

    // Silence gap
    if (realStartMs > lastEndMs) {
      const gapSec = (realStartMs - lastEndMs) / 1000;
      const silenceFile = join(tmpDir, `silence_${i}.wav`);
      if (!existsSync(silenceFile)) {
        ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=${sampleRate}:cl=mono`, '-t', String(gapSec), silenceFile]);
      }
      segmentInputs.push(silenceFile);
    }

    // Stretch segment
    if (!existsSync(stretchedFile)) {
      const durProbe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ttsFile], { stdio: ['pipe', 'pipe', 'pipe'] });
      const currentSec = parseFloat(durProbe.stdout.toString().trim()) || 0;
      const desiredSec = (segment.end_time - realStartMs) / 1000;

      const first = currentSec * baseFactor;
      const localFactor = first > 1e-3 ? Math.max(0.9, Math.min(1.1, desiredSec / first)) : 1.0;
      const speed = baseFactor * localFactor;

      // Apply atempo filter via ffmpeg
      if (speed !== 1.0) {
        ffmpeg(['-i', ttsFile, '-filter:a', `atempo=${speed.toFixed(4)}`, stretchedFile]);
      } else {
        ffmpeg(['-i', ttsFile, '-c', 'copy', stretchedFile]);
      }
    }

    segmentInputs.push(stretchedFile);

    const segProbe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', stretchedFile], { stdio: ['pipe', 'pipe', 'pipe'] });
    const adjustedSec = parseFloat(segProbe.stdout.toString().trim()) || 0;
    const realEndMs = Math.max(realStartMs + adjustedSec * 1000, segment.end_time);
    lastEndMs = realEndMs;

    segment.actual_start_time = Math.floor(realStartMs);
    segment.actual_end_time = Math.floor(realEndMs);
  }

  // Concatenate all segments (enforce common format for compatibility)
  if (segmentInputs.length === 0) throw new Error('No audio segments to merge');

  const concatFile = join(tmpDir, 'concat_list.txt');
  writeFileSync(concatFile, segmentInputs.map(f => `file '${f}'`).join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatFile, '-acodec', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '1', dubbingFile]);

  writeFileSync(timingsFile, JSON.stringify({ translation }, null, 2));
  await updateStageDB(taskId, 'merge_audio', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Merged' });
}

// ── Stage 9: merge_video ──
function writeSrt(translation: any[], dstLang: string, outputPath: string) {
  const CLOSING_QUOTES = new Set(['"', "'", '」', '』', '》', '）', '】', '\u201d', '\u2019', ']']);
  const PUNCTUATION = new Set(['，', ',', '；', ';', '：', ':', '。', '?', '？', '!', '！', '、']);
  const PROTECTED_PAIRS: Record<string, string> = { '《': '》', '（': '）', '【': '】', '「': '」', '『': '』' };

  function splitProtected(text: string): string[] {
    const segs: string[] = [];
    let buf: string[] = [], inside: string | null = null;
    for (const ch of text) {
      if (!inside && ch in PROTECTED_PAIRS) { inside = PROTECTED_PAIRS[ch]; buf.push(ch); continue; }
      if (inside && ch === inside) { inside = null; buf.push(ch); continue; }
      if (!inside && PUNCTUATION.has(ch)) { const s = buf.join('').trim(); if (s) segs.push(s); buf = []; continue; }
      buf.push(ch);
    }
    const tail = buf.join('').trim();
    if (tail) segs.push(tail);
    return segs;
  }

  function attachClosingQuotes(segs: string[]): string[] {
    const fixed: string[] = [];
    for (const s of segs) {
      if (s && CLOSING_QUOTES.has(s[0]) && fixed.length) {
        fixed[fixed.length - 1] = `${fixed[fixed.length - 1]}${s}`.trim();
      } else {
        fixed.push(s.trim());
      }
    }
    return fixed;
  }

  function mergeShort(segs: string[]): string[] {
    const merged: string[] = [];
    let i = 0;
    while (i < segs.length) {
      let cur = segs[i];
      if (cur.trim().length < 5 && i + 1 < segs.length) {
        segs[i + 1] = `${cur}${segs[i + 1]}`.trim();
        i++;
        continue;
      }
      merged.push(cur);
      i++;
    }
    return merged;
  }

  function stripTrailingPunct(segs: string[]): string[] {
    return segs.map(s => {
      const t = s.trim();
      if (!t) return '';
      if (t.endsWith('，') || t.endsWith(',') || t.endsWith('。')) return t.slice(0, -1);
      return t.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  function splitSubtitle(text: string): string[] {
    if (!text.trim()) return [];
    const segs = stripTrailingPunct(mergeShort(attachClosingQuotes(splitProtected(text))));
    return segs.length ? segs : [text.trim()];
  }

  const lines: string[] = [];
  let idx = 1;
  for (const item of translation) {
    const start = Math.floor(item.actual_start_time ?? item.start_time);
    const end = Math.floor(item.actual_end_time ?? item.end_time);
    if (end <= start) continue;

    const text = (item.dst || item.zh || '').trim();
    const fragments = splitSubtitle(text);
    if (!fragments.length) continue;

    const totalDuration = end - start;
    const weights = fragments.map(f => Math.max(1, f.replace(/\s/g, '').length));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let cursor = start, allocated = 0;

    for (let f = 0; f < fragments.length; f++) {
      const share = f < fragments.length - 1
        ? Math.max(200, Math.min(Math.round(totalDuration * weights[f] / totalWeight), totalDuration - allocated - 100))
        : Math.max(100, totalDuration - allocated);
      lines.push(String(idx));
      lines.push(`${srtTime(cursor)} --> ${srtTime(cursor + share)}`);
      lines.push(fragments[f]);
      lines.push('');
      cursor += share;
      allocated += share;
      idx++;
    }
  }

  writeFileSync(outputPath, lines.join('\n'));
}

async function stageMergeVideo(taskId: string, sessionPath: string) {
  const mediaDir = join(sessionPath, 'media');
  const tmpDir = join(sessionPath, 'tmp');
  const metadataDir = join(sessionPath, 'metadata');

  const videoFile = join(mediaDir, 'video_source.mp4');
  const dubbingFile = join(tmpDir, 'audio_dubbing.wav');
  const bgmFile = join(mediaDir, 'audio_bgm.wav');
  const timingsFile = join(metadataDir, 'timings.json');
  const finalVideo = join(mediaDir, 'video_final.mp4');

  if (!existsSync(videoFile)) throw new Error('video_source.mp4 not found');
  if (!existsSync(dubbingFile)) throw new Error('audio_dubbing.wav not found');
  if (!existsSync(timingsFile)) throw new Error('timings.json not found');

  // Write SRT subtitles
  const data = JSON.parse(readFileSync(timingsFile, 'utf-8'));
  const dstLang = data.translation.find((t: any) => t.dst_lang)?.dst_lang || 'zh';
  writeSrt(data.translation, dstLang, join(metadataDir, `subtitles.${dstLang}.srt`));

  // Probe video orientation for subtitle style
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', videoFile], { stdio: ['pipe', 'pipe', 'pipe'] });
  const sizeStr = probe.stdout.toString().trim();
  const [wStr, hStr] = sizeStr.split(',');
  const width = parseInt(wStr), height = parseInt(hStr);
  const isPortrait = height > width;
  const fontSize = isPortrait ? (dstLang === 'zh' ? 12 : 9) : (dstLang === 'zh' ? 24 : 18);
  const marginV = isPortrait ? 70 : 5;
  const font = dstLang === 'zh' ? 'Noto Sans CJK SC' : 'Arial';
  const style = `FontName=${font},FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=${marginV}`;

  // Pass 1: mix dubbing + BGM
  const mixedAudio = join(tmpDir, 'audio_mixed.m4a');
  const resolved = (p: string) => p;
  ffmpeg(['-i', dubbingFile, '-i', bgmFile, '-filter_complex',
    '[0:a]volume=1.0[a0];[1:a]volume=0.30[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0[aout]',
    '-map', '[aout]', '-c:a', 'aac', mixedAudio]);

  // Pass 2: replace video audio + burn subtitles
  const subPath = join(metadataDir, `subtitles.${dstLang}.srt`);
  // Escape special chars for ffmpeg subtitles filter
  const escapedSub = subPath.replace(/'/g, "'\\\\''").replace(/'/g, "'\\''");
  ffmpeg(['-i', videoFile, '-i', mixedAudio,
    '-vf', `subtitles='${escapedSub}':force_style='${style}'`,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-movflags', '+faststart', '-shortest',
    finalVideo], 300_000);

  await updateStageDB(taskId, 'merge_video', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Merged' });

  // Update task with final path
  const finalPath = `/api/video/${taskId}`;
  await updateTaskDB(taskId, { final_video_path: finalPath });
}

// ── Runner ──

const STAGE_HANDLERS: Record<string, (taskId: string, sessionPath: string, task: any) => Promise<void>> = {
  download: async (id, sp, task) => stageDownload(id, sp, task.url),
  separate: (id, sp, _task) => stageSeparate(id, sp),
  asr: (id, sp, _task) => stageAsr(id, sp),
  asr_fix: (id, sp, _task) => stageAsrFix(id, sp),
  translate: (id, sp, _task) => stageTranslate(id, sp),
  split_audio: (id, sp, _task) => stageSplitAudio(id, sp),
  tts: (id, sp, _task) => stageTts(id, sp),
  merge_audio: (id, sp, _task) => stageMergeAudio(id, sp),
  merge_video: (id, sp, _task) => stageMergeVideo(id, sp),
};

async function currentTask(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);
  const sp = task.session_path ? resolve(REPO_ROOT, task.session_path) : join(WORKFOLDER, taskId);
  return { task, sessionPath: sp };
}

export async function runPipeline(taskId: string) {
  let { task, sessionPath } = await currentTask(taskId);
  mkdirSync(sessionPath, { recursive: true });

  await updateTaskDB(taskId, { status: 'running', started_at: nowISO() });

  for (const stage of STAGES) {
    const handler = STAGE_HANDLERS[stage.name];
    if (!handler) {
      emitLog(taskId, `[WARN] [Pipeline] No handler for stage ${stage.name}, skipping`);
      continue;
    }

    await updateStageDB(taskId, stage.name, { status: 'running', started_at: nowISO(), last_message: `Starting ${stage.label}...` });
    await updateTaskDB(taskId, { current_stage: stage.name });

    try {
      await handler(taskId, sessionPath, task);
    } catch (err: any) {
      const msg = err.message ?? String(err);
      emitLog(taskId, `[ERROR] [Pipeline] Stage ${stage.name} failed: ${msg}`);
      await updateStageDB(taskId, stage.name, { status: 'failed', error_message: msg, completed_at: nowISO() });
      await updateTaskDB(taskId, { status: 'failed', error_message: msg });
      return;
    }

    // Re-read task after each stage (download may have updated session_path)
    const next = await currentTask(taskId).catch(() => null);
    if (next) { task = next.task; sessionPath = next.sessionPath; }
  }

  await updateTaskDB(taskId, { status: 'succeeded', completed_at: nowISO(), current_stage: null });
  emitLog(taskId, `[Pipeline] Task ${taskId} completed`);
}

export async function resumePipeline(taskId: string, resumeFrom?: string) {
  let { task, sessionPath } = await currentTask(taskId);

  let startIdx = 0;

  if (resumeFrom) {
    startIdx = STAGES.findIndex(s => s.name === resumeFrom);
    if (startIdx === -1) throw new Error(`Unknown stage "${resumeFrom}"`);
    for (let i = startIdx; i < STAGES.length; i++) {
      await updateStageDB(taskId, STAGES[i].name, { status: 'pending', started_at: null, completed_at: null, error_message: null, progress: 0 });
    }
    emitLog(taskId, `[Pipeline] Resetting from "${resumeFrom}" (${STAGES.length - startIdx} stage(s)), resuming...`);
  } else {
    const rows = await db.select({ name: taskStages.name, status: taskStages.status }).from(taskStages).where(eq(taskStages.task_id, taskId));
    const stageStatus = new Map(rows.map(r => [r.name, r.status]));

    for (let i = 0; i < STAGES.length; i++) {
      if (stageStatus.get(STAGES[i].name) !== 'succeeded') {
        startIdx = i;
        break;
      }
    }

    if (startIdx === 0) {
      emitLog(taskId, `[Pipeline] Resuming from beginning`);
    } else {
      emitLog(taskId, `[Pipeline] Skipping ${startIdx} completed stage(s), resuming from "${STAGES[startIdx].name}"`);
    }
  }

  await updateTaskDB(taskId, { status: 'running', started_at: nowISO() });

  for (let i = startIdx; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const handler = STAGE_HANDLERS[stage.name];
    if (!handler) {
      emitLog(taskId, `[WARN] [Pipeline] No handler for stage ${stage.name}, skipping`);
      continue;
    }

    await updateStageDB(taskId, stage.name, { status: 'running', started_at: nowISO(), last_message: `Starting ${stage.label}...` });
    await updateTaskDB(taskId, { current_stage: stage.name });

    try {
      await handler(taskId, sessionPath, task);
    } catch (err: any) {
      const msg = err.message ?? String(err);
      emitLog(taskId, `[ERROR] [Pipeline] Stage ${stage.name} failed: ${msg}`);
      await updateStageDB(taskId, stage.name, { status: 'failed', error_message: msg, completed_at: nowISO() });
      await updateTaskDB(taskId, { status: 'failed', error_message: msg });
      return;
    }

    // Re-read task after each stage
    const next = await currentTask(taskId).catch(() => null);
    if (next) { task = next.task; sessionPath = next.sessionPath; }
  }

  await updateTaskDB(taskId, { status: 'succeeded', completed_at: nowISO(), current_stage: null });
  emitLog(taskId, `[Pipeline] Task ${taskId} completed`);
}

export async function rerunSingleStage(taskId: string, stageName: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);

  const stage = STAGES.find(s => s.name === stageName);
  if (!stage) throw new Error(`Unknown stage "${stageName}"`);

  const handler = STAGE_HANDLERS[stageName];
  if (!handler) throw new Error(`No handler for stage "${stageName}"`);

  const sessionPath = task.session_path ? resolve(REPO_ROOT, task.session_path) : join(WORKFOLDER, taskId);

  await updateStageDB(taskId, stageName, { status: 'pending', started_at: null, completed_at: null, error_message: null, progress: 0 });
  await updateStageDB(taskId, stageName, { status: 'running', started_at: nowISO(), last_message: `Rerunning ${stage.label}...` });
  await updateTaskDB(taskId, { status: 'running', current_stage: stageName });

  try {
    await handler(taskId, sessionPath, task);
  } catch (err: any) {
    const msg = err.message ?? String(err);
    emitLog(taskId, `[ERROR] [Pipeline] Stage ${stageName} failed: ${msg}`);
    await updateStageDB(taskId, stageName, { status: 'failed', error_message: msg, completed_at: nowISO() });
    await updateTaskDB(taskId, { status: 'failed', error_message: msg });
    return;
  }

  await updateStageDB(taskId, stageName, { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: `${stage.label} completed` });
  emitLog(taskId, `[Pipeline] Stage ${stageName} completed`);
}

export async function getStageStatuses(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);

  const rows = await db
    .select({
      name: taskStages.name,
      label: taskStages.label,
      status: taskStages.status,
      progress: taskStages.progress,
      last_message: taskStages.last_message,
      error_message: taskStages.error_message,
      started_at: taskStages.started_at,
      completed_at: taskStages.completed_at,
    })
    .from(taskStages)
    .where(eq(taskStages.task_id, taskId));

  const stageMap = new Map(rows.map(r => [r.name, r]));
  const stages = STAGES.map(s => stageMap.get(s.name) ?? { name: s.name, label: s.label, status: 'pending', progress: 0, last_message: null, error_message: null, started_at: null, completed_at: null });

  return {
    taskId,
    url: task.url,
    title: task.title,
    status: task.status,
    current_stage: task.current_stage,
    error_message: task.error_message,
    stages,
  };
}
