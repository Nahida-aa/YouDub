import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const DEMUCS_MODEL_PATH = '/home/aa/repos/learn_ls/YouDub-webui/data/models/demucs';

export interface ModelStatus {
  exists: boolean;
  isReady: boolean;
  missingFiles: string[];
}

export async function checkDemucsStatus(): Promise<ModelStatus> {
  const onnxFiles = [
    'htdemucs_fp16weights.onnx',
  ];

  const missingFiles: string[] = [];

  let onnxReady = true;
  for (const file of onnxFiles) {
    if (!existsSync(join(DEMUCS_MODEL_PATH, file))) {
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
