import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, readEnginesConfig } from '@repo/config';
import { readTaskLanguages, nowISO, updateStageDB, emitLog } from './utils.ts';

export async function stageAsr(taskId: string, sessionPath: string) {
  await updateStageDB(taskId, 'asr', { last_message: 'Transcribing...', progress: 0 });

  const vocalsPath = resolve(REPO_ROOT, sessionPath, 'media', 'audio_vocals.wav');
  const sessionAbsPath = resolve(REPO_ROOT, sessionPath);
  if (!existsSync(vocalsPath)) throw new Error('audio_vocals.wav not found');

  const engines = readEnginesConfig();
  const { device } = engines.asr;
  emitLog(taskId, `[ASR] device=${device}`);

  const asrScript = join(REPO_ROOT, 'packages', 'cli', 'scripts', 'asr', 'run.py');
  const pythonBin = join(REPO_ROOT, '.venv', 'bin', 'python');
  const { asrLanguage } = readTaskLanguages(sessionPath);

  const baseArgs = [asrScript, vocalsPath, sessionAbsPath, asrLanguage || 'auto'];

  const attempts = device === 'cpu' ? 1 : 2;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const args = attempt === 0 && device === 'gpu' ? baseArgs : [...baseArgs, '--cpu'];
    const result = spawnSync(pythonBin, args, {
      maxBuffer: 256 * 1024 * 1024,
      timeout: 600_000,
    });

    if (result.signal) {
      const stderr = (result.stderr?.toString() || '').trim().slice(-200);
      if (attempt === 0 && device === 'gpu') {
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

    const asr = JSON.parse(readFileSync(asrOutputPath, 'utf-8'));
    if (asr.detected_language) {
      const localInfoPath = join(sessionPath, 'metadata', 'local_info.json');
      let local: any = {};
      try { local = JSON.parse(readFileSync(localInfoPath, 'utf-8')); } catch { /* new file */ }
      local.asr_language = asr.detected_language;
      writeFileSync(localInfoPath, JSON.stringify(local, null, 2));
    }

    await updateStageDB(taskId, 'asr', { status: 'succeeded', completed_at: nowISO(), progress: 100, last_message: 'Transcribed' });
    return;
  }
}
