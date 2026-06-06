import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Demucs } from './../../ml/demucs/demucs.ts';
import { readEnginesConfig } from '@repo/config';
import { nowISO, updateStageDB, ffmpeg, emitLog } from './utils.ts';

export async function stageSeparate(taskId: string, sessionPath: string) {
  await updateStageDB(taskId, 'separate', { last_message: 'Separating audio...', progress: 0 });

  const videoPath = join(sessionPath, 'media', 'video_source.mp4');
  if (!existsSync(videoPath)) throw new Error('video_source.mp4 not found');

  const engines = readEnginesConfig();
  const { runtime, device } = engines.separate;
  const ep = device === 'webgpu' ? 'webgpu' : 'cpu';
  emitLog(taskId, `[Separate] runtime=${runtime} device=${device} → ONNX session(${ep})`);
  const demucs = new Demucs(undefined, { executionProvider: ep });
  await demucs.load();

  const audioPath = join(sessionPath, 'tmp', 'audio_source.wav');
  mkdirSync(dirname(audioPath), { recursive: true });
  ffmpeg(['-i', videoPath, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', audioPath]);

  const stems = await demucs.separate(audioPath);

  const mediaDir = join(sessionPath, 'media');
  demucs.writeWav(stems.vocals, stems.sampleRate, join(mediaDir, 'audio_vocals.wav'));

  const bgm = new Float32Array(stems.drums.length);
  for (let i = 0; i < bgm.length; i++) {
    bgm[i] = stems.drums[i] + stems.bass[i] + stems.other[i];
  }
  demucs.writeWav(bgm, stems.sampleRate, join(mediaDir, 'audio_bgm.wav'));

  await updateStageDB(taskId, 'separate', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Separated' });
}
