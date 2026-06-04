# cli 

cli 端 兼 core

<!-- Pipeline now gets past Demucs and ASR:
- audio_vocals.wav — 6.9 MB (was 70 bytes), full non-empty audio
- asr.json — 3 KB, contains actual transcriptions
- Next blocker: OPENAI_API_KEY not set → translate stage fails as expected
Both fixes applied to packages/cli/ and packages/api/. -->