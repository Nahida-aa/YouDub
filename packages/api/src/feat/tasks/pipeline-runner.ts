import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { db } from '#/db/index.ts';
import { eq, sql } from 'drizzle-orm';
import { io } from '#/socket.io/io.ts';
import { tasks, taskStages } from '#/feat/tasks/table.ts';
import { STAGES } from '#/feat/tasks/stages.ts';
import { SESSION_DIR } from '#/config/config.ts';
import { Demucs } from '#/ml/demucs/demucs.ts';
import { transcribe as whisperTranscribe } from '#/ml/whisper/whisper.ts';

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '');
}

function broadcastUpdate(table: string, mutations: any[]) {
  io.emit('transaction', {
    id: table,
    transactionId: crypto.randomUUID(),
    mutations,
  });
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

// ---- Stage handlers ----

async function stageDownload(taskId: string, sessionPath: string, url: string) {
  await updateStageDB(taskId, 'download', { last_message: 'Downloading video...', progress: 0 });
  const outDir = join(sessionPath, 'download');
  mkdirSync(outDir, { recursive: true });

  const r = spawnSync('yt-dlp', [
    '-f', 'bestaudio[ext=m4a]+bestvideo[ext=mp4]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', join(outDir, '%(id)s.%(ext)s'),
    url,
  ], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 300_000 });

  if (r.error) throw new Error(`yt-dlp: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`yt-dlp exit ${r.status}: ${r.stderr.toString().slice(0, 200)}`);

  // yt-dlp outputs to <videoId>.mp4 — extract videoId from url
  const videoId = taskId;
  const mp4Path = join(outDir, `${videoId}.mp4`);
  const audioPath = join(sessionPath, 'audio.wav');

  // Extract audio as WAV 16kHz mono for Demucs
  const a = spawnSync('ffmpeg', [
    '-i', mp4Path,
    '-acodec', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    '-y', audioPath,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (a.error) throw new Error(`ffmpeg audio: ${a.error.message}`);
  if (a.status !== 0) throw new Error(`ffmpeg audio exit ${a.status}`);

  await updateStageDB(taskId, 'download', { status: 'completed', completed_at: nowISO(), progress: 100, last_message: 'Downloaded' });
}

async function stageSeparate(taskId: string, sessionPath: string) {
  await updateStageDB(taskId, 'separate', { last_message: 'Separating audio...', progress: 0 });

  const audioPath = join(sessionPath, 'audio.wav');
  if (!existsSync(audioPath)) throw new Error('audio.wav not found (download stage may have failed)');

  const demucs = new Demucs();
  await demucs.load();
  const stems = await demucs.separate(audioPath);

  const outDir = join(sessionPath, 'stems');
  mkdirSync(outDir, { recursive: true });

  demucs.writeWav(stems.vocals, stems.sampleRate, join(outDir, 'vocals.wav'));
  demucs.writeWav(stems.drums, stems.sampleRate, join(outDir, 'drums.wav'));
  demucs.writeWav(stems.bass, stems.sampleRate, join(outDir, 'bass.wav'));
  demucs.writeWav(stems.other, stems.sampleRate, join(outDir, 'other.wav'));

  await updateStageDB(taskId, 'separate', { status: 'completed', completed_at: nowISO(), progress: 100, last_message: 'Separated' });
}

async function stageAsr(taskId: string, sessionPath: string) {
  await updateStageDB(taskId, 'asr', { last_message: 'Transcribing...', progress: 0 });

  const vocalsPath = join(sessionPath, 'stems', 'vocals.wav');
  if (!existsSync(vocalsPath)) throw new Error('vocals.wav not found');

  const segments = await whisperTranscribe(vocalsPath);

  const metadataDir = join(sessionPath, 'metadata');
  mkdirSync(metadataDir, { recursive: true });

  const asrData = {
    audio_info: { duration: segments.reduce((s, seg) => s + (seg.end - seg.start), 0) },
    result: {
      text: segments.map(s => s.text).join(' ').trim(),
      utterances: segments,
    },
  };

  await Bun.write(join(metadataDir, 'asr.json'), JSON.stringify(asrData, null, 2));
  await updateStageDB(taskId, 'asr', { status: 'completed', completed_at: nowISO(), progress: 100, last_message: 'Transcribed' });
}

async function stageStub(taskId: string, stageName: string, _sessionPath: string) {
  await updateStageDB(taskId, stageName, { status: 'completed', completed_at: nowISO(), progress: 100, last_message: 'Skipped (not yet implemented)' });
}

// ---- Runner ----

const STAGE_HANDLERS: Record<string, (taskId: string, sessionPath: string, task: any) => Promise<void>> = {
  download: async (id, sp, task) => stageDownload(id, sp, task.url),
  separate: (id, sp, _task) => stageSeparate(id, sp),
  asr: (id, sp, _task) => stageAsr(id, sp),
  asr_fix: (id, sp, _task) => stageStub(id, 'asr_fix', sp),
  translate: (id, sp, _task) => stageStub(id, 'translate', sp),
  split_audio: (id, sp, _task) => stageStub(id, 'split_audio', sp),
  tts: (id, sp, _task) => stageStub(id, 'tts', sp),
  merge_audio: (id, sp, _task) => stageStub(id, 'merge_audio', sp),
  merge_video: (id, sp, _task) => stageStub(id, 'merge_video', sp),
};

export async function runPipeline(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);

  const sessionPath = join(SESSION_DIR, taskId);
  mkdirSync(sessionPath, { recursive: true });

  await updateTaskDB(taskId, { status: 'running', started_at: nowISO(), session_path: sessionPath });

  for (const stage of STAGES) {
    const handler = STAGE_HANDLERS[stage.name];
    if (!handler) {
      console.warn(`[Pipeline] No handler for stage ${stage.name}, skipping`);
      continue;
    }

    await updateStageDB(taskId, stage.name, { status: 'running', started_at: nowISO(), last_message: `Starting ${stage.label}...` });
    await updateTaskDB(taskId, { current_stage: stage.name });

    try {
      await handler(taskId, sessionPath, task);
    } catch (err: any) {
      const msg = err.message ?? String(err);
      console.error(`[Pipeline] Stage ${stage.name} failed:`, msg);
      await updateStageDB(taskId, stage.name, { status: 'failed', error_message: msg, completed_at: nowISO() });
      await updateTaskDB(taskId, { status: 'failed', error_message: msg });
      return;
    }
  }

  await updateTaskDB(taskId, { status: 'completed', completed_at: nowISO(), current_stage: null });
  console.log(`[Pipeline] Task ${taskId} completed`);
}
