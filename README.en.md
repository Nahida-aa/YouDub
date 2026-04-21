# YouDub WebUI

YouDub WebUI is a minimal local console for turning a YouTube video into a Chinese-dubbed video. This repository contains both the Next.js frontend and the FastAPI backend. It intentionally stays small: one page, one active task, a serial pipeline, SQLite state, and local filesystem artifacts.

Chinese default README: [README.md](README.md).

## Overview

The app takes one YouTube video URL and runs these stages in order:

1. `download`: download one YouTube video with yt-dlp.
2. `separate`: split vocals and background music with Demucs.
3. `asr`: recognize speech with FunASR / SenseVoice.
4. `translate`: translate each utterance independently through an OpenAI-compatible Chat API.
5. `split_audio`: cut vocal reference clips from the original vocal track.
6. `tts`: generate Chinese dubbing with VoxCPM2.
7. `merge_audio`: place generated speech back onto the original timeline.
8. `merge_video`: use FFmpeg to produce the final video with dubbing and subtitles.

This MVP does not include Redis, Postgres, multiple workers, concurrent queues, playlist/channel monitoring, Bilibili upload, cover editing, or multi-user accounts.

## Requirements

Recommended runtime:

- Python 3.12
- Node.js 20+ and npm
- FFmpeg / ffprobe
- Git with submodule support
- CUDA GPU; the development deployment uses GPU1
- A working YouTube proxy, for example `127.0.0.1:20171`
- Valid Netscape-format YouTube cookies
- OpenAI-compatible base URL, API key, and model

Package mirrors:

- Python packages should use Aliyun first: `https://mirrors.aliyun.com/pypi/simple/`
- npm should use npmmirror: `https://registry.npmmirror.com`
- Do not configure Tsinghua as `--extra-index-url`; pip may select packages from the fallback index even when Aliyun has them.
- If one package fails from Aliyun, retry that package separately with Tsinghua.

## Local Installation

Clone the repository:

```bash
cd /Users/liuzhao/code
git clone git@github.com:liuzhao1225/YouDub-webui.git
cd YouDub-webui
```

Create the Python virtual environment and install backend dependencies:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt
```

Use Tsinghua only as a one-package fallback:

```bash
.venv/bin/pip install -i https://pypi.tuna.tsinghua.edu.cn/simple/ <package-name>
```

Initialize the Demucs source submodule:

```bash
git submodule update --init --recursive
```

Install frontend dependencies:

```bash
npm --prefix apps/web install --registry=https://registry.npmmirror.com
```

Prepare runtime environment files:

```bash
cp env.txt.example env.txt
cp env.txt.example .env
```

Codex should not read or edit `.env` directly. Edit `env.txt` first, then copy confirmed values into `.env`. The app itself still reads runtime configuration from `.env`.

Important variables:

```text
WORKFOLDER=./workfolder
MODEL_CACHE_DIR=./data/modelscope
DEVICE=cuda
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
YTDLP_PROXY_PORT=
FUNASR_MODEL=iic/SenseVoiceSmall
FUNASR_VAD_MODEL=fsmn-vad
VOXCPM_MODEL=OpenBMB/VoxCPM2
VOXCPM_MODEL_DIR=
HTTP_PROXY=
```

`YTDLP_PROXY_PORT` is a port only, for example `20171`. The backend converts it to `http://127.0.0.1:20171` for yt-dlp. If no port is configured, yt-dlp can still fall back to `HTTP_PROXY` / `http_proxy`.

## Local Run

Start backend:

```bash
.venv/bin/uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Start frontend development server:

```bash
npm --prefix apps/web run dev -- --hostname 0.0.0.0 --port 3000
```

Open:

```text
http://localhost:3000
```

For production frontend builds, set `NEXT_PUBLIC_API_BASE_URL` at build time because it is compiled into the browser bundle:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm --prefix apps/web run build
npm --prefix apps/web run start -- --hostname 0.0.0.0 --port 3000
```

## Remote GPU Deployment

Development deployment:

```text
Host: gil-gpu
Path: /data1/liuzhao/YouDub-webui
GPU: CUDA_VISIBLE_DEVICES=1
Web: http://172.27.2.90:3000
API: http://172.27.2.90:8000
tmux: youdub-api, youdub-web
Proxy: 127.0.0.1:20171
```

Clone and install:

```bash
ssh gil-gpu
cd /data1/liuzhao
git clone git@github.com:liuzhao1225/YouDub-webui.git
cd YouDub-webui
git submodule update --init --recursive
python3.12 -m venv .venv
.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt
npm --prefix apps/web install --registry=https://registry.npmmirror.com
```

Recommended cache environment for the GPU server:

```bash
export CUDA_VISIBLE_DEVICES=1
export DEVICE=cuda
export MODEL_CACHE_DIR=/data1/liuzhao/modelscope_cache
export MODELSCOPE_CACHE=/data1/liuzhao/modelscope_cache
export TORCH_HOME=/data1/liuzhao/torch_cache
```

Start backend:

```bash
tmux kill-session -t youdub-api 2>/dev/null || true
tmux new-session -d -s youdub-api "\
cd /data1/liuzhao/YouDub-webui && \
export CUDA_VISIBLE_DEVICES=1 DEVICE=cuda \
MODEL_CACHE_DIR=/data1/liuzhao/modelscope_cache \
MODELSCOPE_CACHE=/data1/liuzhao/modelscope_cache \
TORCH_HOME=/data1/liuzhao/torch_cache \
CORS_ALLOW_ORIGINS=http://172.27.2.90:3000,http://100.94.222.54:3000 && \
.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"
```

Build and start frontend:

```bash
NEXT_PUBLIC_API_BASE_URL=http://172.27.2.90:8000 npm --prefix apps/web run build
tmux kill-session -t youdub-web 2>/dev/null || true
tmux new-session -d -s youdub-web "\
cd /data1/liuzhao/YouDub-webui && \
NEXT_PUBLIC_API_BASE_URL=http://172.27.2.90:8000 \
npm --prefix apps/web run start -- --hostname 0.0.0.0 --port 3000"
```

Check status:

```bash
curl -sS http://127.0.0.1:8000/api/health
curl -I http://127.0.0.1:3000
tmux ls
ss -ltnp | grep -E ":(3000|8000) "
```

When using a Tailscale IP for the frontend, rebuild with the matching API IP:

```bash
NEXT_PUBLIC_API_BASE_URL=http://100.94.222.54:8000 npm --prefix apps/web run build
```

## First Use

1. Open the web page.
2. Click `Settings`.
3. Paste Netscape-format YouTube cookies.
4. Set `yt-dlp proxy port`, for example `20171`.
5. Set OpenAI base URL, API key, and model.
6. Optionally click `Get models` to load model IDs from the OpenAI-compatible API.
7. Save settings.
8. Submit a YouTube URL on the main page.

Sensitive values are masked:

- Saved API key is shown as `********`.
- Saved YouTube cookies are represented by a placeholder; plaintext cookie content is never returned from the backend.
- If a masked value is not edited, saving does not overwrite the real secret.

## Repository Layout

```text
apps/web/                 Next.js frontend
apps/web/src/app/         single-page console and global styles
apps/web/src/components/  shadcn/ui-style components
apps/web/src/lib/api.ts   frontend API client
backend/app/              FastAPI, SQLite repository, pipeline runner
backend/app/adapters/     yt-dlp, Demucs, FunASR, OpenAI, VoxCPM, FFmpeg adapters
backend/tests/            backend tests
data/                     SQLite, cookies, logs; ignored by git
workfolder/               video artifacts; ignored by git
submodule/demucs/         Demucs source submodule
env.txt.example           environment template
requirements.txt          Python dependencies
```

## Frontend

The frontend is a vertical single-page console:

1. `Convert video`
2. `Progress`
3. `Task log`

The theme is light-only and uses YouTube red, Bilibili blue, and Bilibili pink. The frontend polls `GET /api/tasks/current` every 2 seconds. There is no SSE or WebSocket.

## Backend API

Task endpoints:

- `POST /api/tasks`: submit one YouTube URL. Returns `409` when another task is queued or running.
- `GET /api/tasks/current`: current or most recent task.
- `GET /api/tasks/{id}`: task detail and stage state.
- `GET /api/tasks/{id}/log`: task log text.
- `GET /api/tasks/{id}/artifact/final-video`: final video download.

Settings endpoints:

- `GET /api/cookies/youtube`: cookie metadata only, no cookie content.
- `POST /api/cookies/youtube`: save Netscape-format YouTube cookies.
- `GET /api/settings/openai`: read OpenAI base URL, model, `has_api_key`, and masked API key.
- `POST /api/settings/openai`: save OpenAI base URL, API key, and model.
- `POST /api/settings/openai/models`: fetch model IDs from OpenAI-compatible `/models`.
- `GET /api/settings/ytdlp`: read yt-dlp proxy port.
- `POST /api/settings/ytdlp`: save yt-dlp proxy port.
- `GET /api/health`: health check.

## Runtime Data and Artifacts

Runtime data is local:

- `data/youdub.sqlite`: SQLite database.
- `data/cookies/youtube.txt`: Netscape-format YouTube cookies.
- `data/logs/{task_id}.log`: task logs.
- `workfolder/{uploader_slug}/{title_slug}__{video_id}/`: task workspace.

Important artifacts:

```text
media/video_source.mp4
media/audio_vocals.wav
media/audio_bgm.wav
metadata/ytdlp_info.json
metadata/asr.json
metadata/translation.zh.json
metadata/subtitles.zh.srt
segments/vocals/*.wav
segments/tts/*.wav
tmp/audio_dubbing.wav
media/video_final.mp4
```

## Demucs

Demucs must be used as a source submodule:

```text
submodule/demucs
```

The backend imports `demucs.api.Separator`. The published PyPI package is not the primary source because this API is required from the source tree.

## yt-dlp

The first format selector follows the old `youdub-backend` behavior:

```text
bestvideo[height<=1080]+bestaudio/best
```

Fallback selectors:

```text
bestvideo+bestaudio/best
bv*+ba/b
best
```

The project depends on `yt-dlp[default]`, which installs `yt-dlp-ejs`. The backend adapter enables Node JavaScript runtime:

```python
js_runtimes={"node": {}}
```

This is needed for YouTube n-challenge solving. `node` must be available in `PATH`.

Common download failures:

- proxy IP is rate limited by YouTube with HTTP 429;
- cookies are stale, incomplete, or rotated by the browser;
- YouTube asks to sign in to confirm the request is not from a bot.

When yt-dlp reports `cookies are no longer valid` or `Sign in to confirm you're not a bot`, export fresh Netscape cookies from a logged-in browser session and save them in Settings.

## Models

Default models:

- FunASR: `iic/SenseVoiceSmall`
- FunASR VAD: `fsmn-vad`
- VoxCPM: `OpenBMB/VoxCPM2`

Use ModelScope where possible. VoxCPM2 is downloaded with `modelscope.snapshot_download`. Recommended cache variables:

```text
MODEL_CACHE_DIR=/data1/liuzhao/modelscope_cache
MODELSCOPE_CACHE=/data1/liuzhao/modelscope_cache
TORCH_HOME=/data1/liuzhao/torch_cache
```

Verified remote cache paths:

```text
/data1/liuzhao/modelscope_cache/OpenBMB__VoxCPM2
/data1/liuzhao/modelscope_cache/models/iic/SenseVoiceSmall
/data1/liuzhao/modelscope_cache/models/iic/speech_fsmn_vad_zh-cn-16k-common-pytorch
/data1/liuzhao/torch_cache/hub/checkpoints
```

Demucs weights are downloaded by upstream Demucs code into the PyTorch hub cache.

## Tests

Backend:

```bash
.venv/bin/pytest backend/tests
```

Frontend:

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Current backend coverage includes:

- YouTube URL validation.
- Cookie and API key masking.
- OpenAI models endpoint.
- yt-dlp proxy port validation.
- yt-dlp format selector order and Node EJS runtime.
- fixed serial stage progression.
- mocked full pipeline success and failure.
- one request per translation utterance.
- FFmpeg helper behavior.

## Current Limitations

- Only one active task is supported.
- No task cancellation endpoint yet.
- No task deletion or cleanup UI yet.
- No playlist/channel monitoring.
- No Bilibili upload.
- No user accounts or multi-user security model.
- YouTube cookies are stored locally in plaintext.
- OpenAI API key is stored locally in plaintext.
- The frontend polls progress instead of streaming real logs.

## Operations Notes

- Do not commit `.env`, `data/`, `workfolder/`, model caches, downloaded videos, or cookies.
- Re-export YouTube cookies when they expire.
- Set proxy port in Settings when the server needs v2rayA or another local proxy.
- For production frontend builds, confirm `NEXT_PUBLIC_API_BASE_URL` points to an API address reachable from the browser.
- Use Aliyun first for dependency installs; use Tsinghua only as a single-package manual fallback.
