export interface StageSpec {
  name: string
  label: string
}

export const STAGES: StageSpec[] = [
  { name: 'download', label: 'Download' },
  { name: 'separate', label: 'Demucs' },
  { name: 'asr', label: 'Whisper' },
  { name: 'asr_fix', label: 'Split sentences' },
  { name: 'translate', label: 'Translate' },
  { name: 'split_audio', label: 'Split audio' },
  { name: 'tts', label: 'VoxCPM' },
  { name: 'merge_audio', label: 'Merge audio' },
  { name: 'merge_video', label: 'Merge video' },
]

export const STAGE_NAMES = STAGES.map(s => s.name)
