import * as ort from 'onnxruntime-node';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { AutoTokenizer } from '@huggingface/transformers';
import { VOXCPM_MODEL_PATH, checkVoxCPMStatus } from './load';

const CFG = {
  patchSize: 4,
  featDim: 64,
  hiddenSize: 2048,
  baseNumLayers: 28,
  residualNumLayers: 8,
  numKvHeads: 2,
  kvChannels: 128,
  chunkSize: 640,
  sampleRate: 16000,
  outSampleRate: 48000,
  maxLen: 2000,
  minLen: 2,
  defaultCfgValue: 2.0,
  audioStartToken: 101,
  audioEndToken: 102,
  refAudioStartToken: 103,
  refAudioEndToken: 104,
};

export interface VoxCPMGenerateOptions {
  text: string;
  referenceWavPath: string;
  cfgValue?: number;
  maxPatches?: number;
  minPatches?: number;
}

export class VoxCPM {
  private prefill?: ort.InferenceSession;
  private decode?: ort.InferenceSession;
  private vaeEnc?: ort.InferenceSession;
  private vaeDec?: ort.InferenceSession;
  private tokenizer?: any;
  private loaded = false;
  private transformerEp: ('cpu' | 'webgpu')[];
  private vaeEp: ('cpu' | 'webgpu')[];

  constructor(
    private modelDir: string = VOXCPM_MODEL_PATH,
    options?: { executionProvider?: 'cpu' | 'webgpu' },
  ) {
    const ep = options?.executionProvider ?? 'cpu';
    this.transformerEp = [ep];
    this.vaeEp = ep === 'webgpu' ? ['cpu'] : [ep];
  }

  async load() {
    const status = await checkVoxCPMStatus();
    if (!status.isReady) {
      throw new Error(`VoxCPM model not ready in ${this.modelDir}. Missing ONNX files.`);
    }

    console.log(`[VoxCPM] Loading ONNX sessions (transformer=${this.transformerEp}, vae=${this.vaeEp})...`);
    const transformerOpts: ort.InferenceSession.SessionOptions = { executionProviders: this.transformerEp };
    const vaeOpts: ort.InferenceSession.SessionOptions = { executionProviders: this.vaeEp };
    this.prefill = await ort.InferenceSession.create(`${this.modelDir}/voxcpm2_prefill.onnx`, transformerOpts);
    this.decode = await ort.InferenceSession.create(`${this.modelDir}/voxcpm2_decode_step.onnx`, transformerOpts);
    this.vaeEnc = await ort.InferenceSession.create(`${this.modelDir}/audio_vae_encoder.onnx`, vaeOpts);
    this.vaeDec = await ort.InferenceSession.create(`${this.modelDir}/audio_vae_decoder.onnx`, vaeOpts);

    console.log(`[VoxCPM] Loading tokenizer...`);
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelDir);

    this.loaded = true;
    console.log(`[VoxCPM] Ready.`);
  }

  async generate(options: VoxCPMGenerateOptions): Promise<Float32Array> {
    if (!this.loaded) throw new Error('Call load() first.');

    const cfg = options.cfgValue ?? CFG.defaultCfgValue;
    const minPatches = options.minPatches ?? CFG.minLen;

    // Reload VAE sessions if they were released by a previous generate() call
    const vaeOpts: ort.InferenceSession.SessionOptions = { executionProviders: this.vaeEp };
    if (!this.vaeEnc) {
      this.vaeEnc = await ort.InferenceSession.create(`${this.modelDir}/audio_vae_encoder.onnx`, vaeOpts);
    }
    if (!this.vaeDec) {
      this.vaeDec = await ort.InferenceSession.create(`${this.modelDir}/audio_vae_decoder.onnx`, vaeOpts);
    }

    // 1. Encode reference WAV
    const refFeat = await this._encodeWav(options.referenceWavPath);

    // Release VAE Encoder session to avoid Dawn resource leak
    await this.vaeEnc.release();
    this.vaeEnc = undefined;

    // 2. Tokenize text
    const textIds = await this._tokenize(options.text);
    const textLen = textIds.length;

    // Auto-compute maxPatches from text length (stop_flag is unreliable on ONNX)
    const autoMaxPatches = Math.max(20, Math.ceil(textLen * 6));
    const maxPatches = options.maxPatches ?? autoMaxPatches;

    // 3. Build reference prefix
    const refPatches = Math.floor(refFeat.length / CFG.featDim);
    const totalLen = 2 + refPatches + textLen + 1;
    const zeroFeat = new Float32Array(CFG.featDim);

    const textTokens: bigint[] = [];
    const textMask: number[] = [];
    const featMask: number[] = [];
    const flatFeat = new Float32Array(totalLen * CFG.patchSize * CFG.featDim);

    function writeFeat(pos: number, feat: Float32Array) {
      const offset = pos * CFG.patchSize * CFG.featDim;
      for (let p = 0; p < CFG.patchSize; p++) {
        flatFeat.set(feat, offset + p * CFG.featDim);
      }
    }

    function pushToken(tok: bigint, tMask: number, fMask: number, feat: Float32Array) {
      const pos = textTokens.length;
      textTokens.push(tok);
      textMask.push(tMask);
      featMask.push(fMask);
      writeFeat(pos, feat);
    }

    // ref_audio_start
    pushToken(BigInt(CFG.refAudioStartToken), 1, 0, zeroFeat);

    // ref audio patches
    for (let i = 0; i < refPatches; i++) {
      const start = i * CFG.featDim;
      const patch = new Float32Array(refFeat.subarray(start, start + CFG.featDim));
      pushToken(0n, 0, 1, patch);
    }

    // ref_audio_end
    pushToken(BigInt(CFG.refAudioEndToken), 1, 0, zeroFeat);

    // text tokens + audio_start
    for (const id of textIds) {
      pushToken(BigInt(id), 1, 0, zeroFeat);
    }
    pushToken(BigInt(CFG.audioStartToken), 1, 0, zeroFeat);

    const seqLen = textTokens.length;

    const prefillFeeds: Record<string, ort.Tensor> = {
      'text': new ort.Tensor('int64', BigInt64Array.from(textTokens), [1, seqLen]),
      'text_mask': new ort.Tensor('int32', new Int32Array(textMask), [1, seqLen]),
      'feat': new ort.Tensor('float32', flatFeat, [1, seqLen, CFG.patchSize, CFG.featDim]),
      'feat_mask': new ort.Tensor('int32', new Int32Array(featMask), [1, seqLen]),
    };

    const pfOut = await this.prefill!.run(prefillFeeds);
    let ditHidden = pfOut['dit_hidden'] as ort.Tensor;
    let baseKeys = pfOut['base_next_keys'] as ort.Tensor;
    let baseVals = pfOut['base_next_values'] as ort.Tensor;
    let resKeys = pfOut['residual_next_keys'] as ort.Tensor;
    let resVals = pfOut['residual_next_values'] as ort.Tensor;
    let prefixCond = pfOut['prefix_feat_cond'] as ort.Tensor;

    // 5. Decode loop
    console.log(`[VoxCPM] Generating...`);
    const predPatches: Float32Array[] = [];

    for (let step = 0; step < maxPatches; step++) {
      const noise = new Float32Array(CFG.patchSize * CFG.featDim);
      for (let i = 0; i < noise.length; i++) {
        noise[i] = randn();
      }

      const decFeeds: Record<string, ort.Tensor> = {
        'dit_hidden': ditHidden,
        'base_next_keys': baseKeys,
        'base_next_values': baseVals,
        'residual_next_keys': resKeys,
        'residual_next_values': resVals,
        'prefix_feat_cond': prefixCond,
        'noise': new ort.Tensor('float32', noise, [1, CFG.patchSize, CFG.featDim]),
        'cfg_value': new ort.Tensor('float32', new Float32Array([cfg]), []),
      };

      const decOut = await this.decode!.run(decFeeds);

      const predFeat = decOut['pred_feat'] as ort.Tensor;
      const pData = predFeat.data as Float32Array;
      const patch = new Float32Array(pData);
      predPatches.push(patch);

      ditHidden = decOut['new_dit_hidden'] as ort.Tensor;
      baseKeys = decOut['new_base_next_keys'] as ort.Tensor;
      baseVals = decOut['new_base_next_values'] as ort.Tensor;
      resKeys = decOut['new_residual_next_keys'] as ort.Tensor;
      resVals = decOut['new_residual_next_values'] as ort.Tensor;
      prefixCond = new ort.Tensor('float32', new Float32Array(pData), [1, CFG.patchSize, CFG.featDim]);

      if (step >= minPatches) {
        const stopFlag = decOut['stop_flag'] as ort.Tensor;
        const stopData = stopFlag.data as Uint8Array;
        if (stopData[0] !== 0) {
          console.log(`[VoxCPM] Stopped at step ${step}`);
          break;
        }
      }

      if (step % 20 === 19 || step === maxPatches - 1) {
        console.log(`[VoxCPM] Step ${step + 1}/${maxPatches}`);
      }
    }

    // 6. VAE Decode all patches
    console.log(`[VoxCPM] VAE decoding ${predPatches.length} patches...`);
    const numPatches = predPatches.length;
    const zLen = numPatches * CFG.patchSize;
    const zData = new Float32Array(CFG.featDim * zLen);
    for (let t = 0; t < numPatches; t++) {
      const patch = predPatches[t];
      for (let p = 0; p < CFG.patchSize; p++) {
        for (let d = 0; d < CFG.featDim; d++) {
          zData[d * zLen + t * CFG.patchSize + p] = patch[p * CFG.featDim + d];
        }
      }
    }

    const decFeeds: Record<string, ort.Tensor> = {
      'z': new ort.Tensor('float32', zData, [1, CFG.featDim, zLen]),
    };

    const aeOut = await this.vaeDec!.run(decFeeds);
    const audioTensor = aeOut['audio'] as ort.Tensor;
    const audioData = audioTensor.data as Float32Array;

    // Release VAE Decoder session to avoid Dawn resource leak
    await this.vaeDec.release();
    this.vaeDec = undefined;

    console.log(`[VoxCPM] Generated ${audioData.length} samples at ${CFG.outSampleRate}Hz`);
    return audioData;
  }

  private async _tokenize(text: string): Promise<number[]> {
    const result = await this.tokenizer(text);
    const ids = Array.from(result.input_ids.data as bigint[]).map(Number);

    const splitMap = this._buildSplitMap();
    const expanded: number[] = [];
    for (const id of ids) {
      const expansion = splitMap.get(id);
      if (expansion) {
        expanded.push(...expansion);
      } else {
        expanded.push(id);
      }
    }
    return expanded;
  }

  private _buildSplitMap(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    const vocab = (this.tokenizer as any).get_vocab?.() as Record<string, number> | undefined;
    if (!vocab) return map;

    for (const [token, tid] of Object.entries(vocab)) {
      const clean = token.replace('\u2581', '');
      if (clean.length >= 2 && [...clean].every(c => _isCjk(c))) {
        const charIds = [...clean].map(c => vocab[c]).filter(id => id !== undefined);
        if (charIds.length === clean.length) {
          map.set(tid, charIds);
        }
      }
    }
    return map;
  }

  private async _encodeWav(wavPath: string): Promise<Float32Array> {
    let audio: Float32Array;
    let sampleRate: number;

    // Read WAV file
    const buf = readFileSync(wavPath);
    const header = Buffer.from(buf.buffer, buf.byteOffset, 44);
    const sr = header.readUInt32LE(24);
    const numChannels = header.readUInt16LE(22);
    const bitsPerSample = header.readUInt16LE(34);
    const dataStart = header.readUInt32LE(40) + 8 || 44;
    const dataLength = buf.length - dataStart;

    sampleRate = sr;

    if (bitsPerSample === 16) {
      const samples = new Int16Array(buf.buffer, buf.byteOffset + dataStart, dataLength / 2);
      audio = new Float32Array(samples.length / numChannels);
      for (let i = 0; i < audio.length; i++) {
        audio[i] = samples[i * numChannels] / 32768;
      }
    } else if (bitsPerSample === 32) {
      const samples = new Float32Array(buf.buffer, buf.byteOffset + dataStart, dataLength / 4);
      audio = new Float32Array(samples.length / numChannels);
      for (let i = 0; i < audio.length; i++) {
        audio[i] = samples[i * numChannels];
      }
    } else {
      throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
    }

    // Resample to 16kHz if needed
    if (sampleRate !== CFG.sampleRate) {
      audio = this._resample(audio, sampleRate, CFG.sampleRate);
    }

    // Pad to patch_len multiple
    const patchLen = CFG.patchSize * CFG.chunkSize;
    if (audio.length % patchLen !== 0) {
      const padSize = patchLen - (audio.length % patchLen);
      const padded = new Float32Array(audio.length + padSize);
      padded.set(audio);
      audio = padded;
    }

    // VAE Encoder
    const encOut = await this.vaeEnc!.run({
      'audio_data': new ort.Tensor('float32', audio, [1, 1, audio.length]),
    });
    const z = encOut['z'] as ort.Tensor;
    const zData = z.data as Float32Array;

    // Reshape z (1, D, T) → (T/P, P, D)
    const D = CFG.featDim;
    const T = zData.length / D;
    const P = CFG.patchSize;
    const numPatches = Math.floor(T / P);
    const feat = new Float32Array(numPatches * D);

    for (let ti = 0; ti < numPatches; ti++) {
      for (let d = 0; d < D; d++) {
        // Sum over patch dimension (simple average)
        let sum = 0;
        for (let p = 0; p < P; p++) {
          sum += zData[d * T + ti * P + p] || 0;
        }
        feat[ti * D + d] = sum / P;
      }
    }

    return feat;
  }

  private _resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    const ratio = toRate / fromRate;
    const outLen = Math.round(input.length * ratio);
    const output = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i / ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = input[Math.min(idx, input.length - 1)] ?? 0;
      const b = input[Math.min(idx + 1, input.length - 1)] ?? 0;
      output[i] = a + (b - a) * frac;
    }
    return output;
  }
}

function _isCjk(c: string): boolean {
  const code = c.charCodeAt(0);
  return (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0xf900 && code <= 0xfaff);
}

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
