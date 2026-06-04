import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WHISPER_MODEL_PATH = join(__dirname, '..', '..', '..', '..', '..', 'data', 'models', 'whisper-large-v3-turbo');

export interface ModelStatus {
  exists: boolean;
  isReady: boolean;
  size?: string;
  missingFiles: string[];
}

const REQUIRED_FILES = [
  'onnx/encoder_model.onnx',
  'onnx/encoder_model.onnx_data',
  'onnx/decoder_model_merged.onnx',
  'tokenizer.json',
  'vocab.json',
];

export async function checkWhisperStatus(): Promise<ModelStatus> {
  const missingFiles: string[] = [];
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(WHISPER_MODEL_PATH, file))) {
      missingFiles.push(file);
    }
  }
  return {
    exists: missingFiles.length < REQUIRED_FILES.length,
    isReady: missingFiles.length === 0,
    missingFiles,
  };
}
