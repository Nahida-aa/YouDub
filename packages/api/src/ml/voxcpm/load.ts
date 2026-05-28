import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const VOXCPM_MODEL_PATH = '/home/aa/repos/learn_ls/YouDub-webui/data/modelscope/OpenBMB__VoxCPM2';

export interface ModelStatus {
  exists: boolean;
  isReady: boolean; // 是否有 ONNX 可以直接运行
  size?: string;
  missingFiles: string[];
}

export async function checkVoxCPMStatus(): Promise<ModelStatus> {
  const requiredFiles = [
    'model.safetensors',
    'config.json',
    'audiovae.pth'
  ];
  
  const onnxFiles = [
    'voxcpm2_prefill.onnx',
    'voxcpm2_prefill.onnx.data',
    'voxcpm2_decode_step.onnx',
    'voxcpm2_decode_step.onnx.data',
    'audio_vae_decoder.onnx',
    'audio_vae_decoder.onnx.data',
    'audio_vae_encoder.onnx',
    'audio_vae_encoder.onnx.data'
  ];

  const missingFiles: string[] = [];
  let existsCount = 0;

  for (const file of requiredFiles) {
    if (!existsSync(join(VOXCPM_MODEL_PATH, file))) {
      missingFiles.push(file);
    } else {
      existsCount++;
    }
  }

  let onnxReady = true;
  for (const file of onnxFiles) {
    if (!existsSync(join(VOXCPM_MODEL_PATH, file))) {
      onnxReady = false;
      break;
    }
  }

  return {
    exists: existsCount > 0,
    isReady: onnxReady,
    missingFiles
  };
}
