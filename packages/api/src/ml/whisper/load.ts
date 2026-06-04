import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WHISPER_ONNX_DIR } from '#/config/config.ts';

export { WHISPER_ONNX_DIR as WHISPER_MODEL_PATH };

export interface ModelStatus {
  exists: boolean;
  isReady: boolean;
  missingFiles: string[];
}

export async function checkWhisperStatus(): Promise<ModelStatus> {
  const onnxFiles = [
    'onnx/encoder_model.onnx',
    'onnx/decoder_model_merged.onnx',
  ];

  const missingFiles: string[] = [];

  let onnxReady = true;
  for (const file of onnxFiles) {
    if (!existsSync(join(WHISPER_ONNX_DIR, file))) {
      missingFiles.push(file);
      onnxReady = false;
    }
  }

  return {
    exists: onnxReady,
    isReady: onnxReady,
    missingFiles,
  };
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
