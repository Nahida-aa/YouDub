# cli 

cli 端 兼 core

<!-- Pipeline now gets past Demucs and ASR:
- audio_vocals.wav — 6.9 MB (was 70 bytes), full non-empty audio
- asr.json — 3 KB, contains actual transcriptions
- Next blocker: OPENAI_API_KEY not set → translate stage fails as expected
Both fixes applied to packages/cli/ and packages/api/. -->

## config

```json
{
  "$schema": "./config.schema.json",
  "command": "createTask",
  "createTask": {
    "sourceFile": "https://github-production-user-asset-6210df.s3.amazonaws.com/15737086/581823231-bd02936f-cf3c-4e4b-85b5-0410d38f69f5.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAVCODYLSA53PQK4ZA%2F20260606%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260606T152059Z&X-Amz-Expires=300&X-Amz-Signature=63e34f5fec66cb08e1d2e7ee67fc8f7fe80d275784f8d8a71b60a17f89c4387c&X-Amz-SignedHeaders=host&response-content-type=video%2Fmp4",
    "targetLang": "zh"
  },
  "engines": {
    "separate": {
      "runtime": "pytorch",
      "device": "gpu"
    },
    "asr": {
      "runtime": "pytorch",
      "device": "gpu"
    },
    "tts": {
      "runtime": "pytorch",
      "device": "gpu"
    }
  }
}
```