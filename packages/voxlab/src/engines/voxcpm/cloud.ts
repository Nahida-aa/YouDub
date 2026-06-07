import { Client, handle_file } from '@gradio/client';
import type { TTSGenerateOptions, TTSGenerateResult, TTSBackend, VoxCPMCloudConfig } from '../../types.ts';
import { readFileSync } from 'node:fs';

const DEFAULT_API_URL = 'https://voxcpm.modelbest.cn';

export class VoxCPMCloud implements TTSBackend {
  readonly name = 'cloud';
  private client?: InstanceType<typeof Client>;
  private config: VoxCPMCloudConfig;

  constructor(config: VoxCPMCloudConfig = {}) {
    this.config = config;
  }

  async load(): Promise<void> {
    const url = this.config.apiUrl ?? DEFAULT_API_URL;
    console.log(`[VoxCPM] Connecting to ${url}...`);
    this.client = await Client.connect(url);
    console.log(`[VoxCPM] Connected.`);
  }

  async dispose(): Promise<void> {
    this.client = undefined;
  }

  async generate(options: TTSGenerateOptions): Promise<TTSGenerateResult> {
    if (!this.client) throw new Error('Call load() first.');
    const tStart = performance.now();

    const cfg = options.cfgValue ?? 2.0;

    // Upload reference audio via Gradio's handle_file
    let refFile: unknown = null;
    let isUltimate = false;
    let promptText = '';
    if (options.referenceWavPath) {
      refFile = handle_file(readFileSync(options.referenceWavPath));
    }

    const result = await this.client.predict('/generate', [
      options.text,
      this.config.controlInstruction ?? '',
      refFile,               // reference_audio (FileData | null)
      isUltimate,            // ultimate cloning mode
      promptText,            // prompt text
      cfg,                   // cfg_value
      false,                 // normalize
      false,                 // ref_denoise
      10,                    // dit_steps
      '',
    ]);

    const genTime = (performance.now() - tStart) / 1000;

    const audioFile = result.data[0] as { url?: string; path?: string };
    const audioUrl = audioFile.url ?? audioFile.path;
    if (!audioUrl) throw new Error('No audio URL in response');

    const resp = await fetch(audioUrl);
    const buf = await resp.arrayBuffer();

    const int16 = new Int16Array(buf);
    const samples = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      samples[i] = int16[i] / 32768;
    }

    return { samples, loadTimeSec: 0, genTimeSec: genTime };
  }
}
