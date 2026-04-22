<p align="center">
  <img src="apps/web/public/youdub-logo.svg" alt="YouDub" width="320" />
</p>

# YouDub WebUI

A simple local web app for turning YouTube videos into Chinese-dubbed videos.

Paste a YouTube URL, configure YouTube cookies and an OpenAI-compatible API, then YouDub WebUI downloads the video, separates vocals, recognizes speech, translates line by line, generates Chinese dubbing, and renders a final video with Chinese subtitles and voiceover.

中文 README: [README.md](README.md)

> **Author's Bilibili channel**: [黑纹白斑马](https://space.bilibili.com/1263732318) — 650K+ followers, 20K+ videos, self-titled "Cyber Prometheus". The entire channel is dubbed with YouDub WebUI, covering tech, gaming, science, animals, history and more. Visit it to see what this project produces in the wild.

## Demo

Two real samples produced by this project, both playable inline on GitHub. The Blastoff sample shows the first 40 seconds; full mp4 files live in this repo's [`demo-assets`](https://github.com/liuzhao1225/YouDub-webui/releases/tag/demo-assets) Release.

### 1. Jensen Huang on Nvidia's Competition

[YouTube source](https://www.youtube.com/shorts/TbotsRXyRME) · Vertical Shorts

<table>
<tr><th>Original (EN)</th><th>Dubbed (ZH)</th></tr>
<tr>
<td>

https://github.com/user-attachments/assets/befd11ca-e720-4faa-b4e0-d89bfe73df87

</td>
<td>

https://github.com/user-attachments/assets/bf01f912-eec8-4e0d-8698-0f69283a73e7

</td>
</tr>
</table>

### 2. How much YT paid me for 129 million shorts views

[YouTube source](https://www.youtube.com/watch?v=ii9Kh4XkA5g) · Long-form horizontal · 40-second clip below; full version available in the [`demo-assets`](https://github.com/liuzhao1225/YouDub-webui/releases/tag/demo-assets) Release

<table>
<tr><th>Original (EN)</th><th>Dubbed (ZH)</th></tr>
<tr>
<td>

https://github.com/user-attachments/assets/bd02936f-cf3c-4e4b-85b5-0410d38f69f5

</td>
<td>

https://github.com/user-attachments/assets/158de60a-7de4-4ddf-b3d8-478d0423aee6

</td>
</tr>
</table>

The dubbed versions ship with auto-generated Chinese voiceover and Chinese subtitles, while keeping the original background music and effects.

## Why This Project Exists

Many great videos are locked behind language barriers. YouDub WebUI tries to make video localization easier to understand, run, and modify. It is not a heavy platform or a complex workflow engine. It is a small local-first system that developers can quickly try and extend.

It is useful for:

- People who want Chinese-dubbed versions of YouTube videos.
- Developers exploring AI video localization.
- Builders prototyping with FunASR, VoxCPM, OpenAI APIs, Demucs, and FFmpeg.
- Open-source contributors who want to help ideas travel across languages.

## Highlights

- One-page web console: paste a URL and start.
- Manage YouTube cookies, proxy port, and OpenAI-compatible API settings in the UI.
- See task progress stage by stage.
- Serial pipeline by design, making it easy to debug and customize.
- Local SQLite state and local filesystem artifacts.
- Model downloads prefer ModelScope.
- Demucs is included as a source submodule because the released package does not provide the API this project needs.

## Pipeline

```text
YouTube URL
  -> yt-dlp download
  -> Demucs vocal/background separation
  -> FunASR / SenseVoice transcription
  -> OpenAI-compatible line-by-line translation
  -> VoxCPM2 Chinese dubbing
  -> FFmpeg final rendering
```

## Quick Start

### 1. Prepare Runtime

Recommended:

- Python 3.12
- Node.js 20+
- FFmpeg / ffprobe
- CUDA GPU
- A working YouTube proxy
- Netscape-format YouTube cookies
- OpenAI-compatible base URL, API key, and model

### 2. Clone

```bash
git clone https://github.com/liuzhao1225/YouDub-webui.git
cd YouDub-webui
git submodule update --init --recursive
```

### 3. Install Dependencies

Python:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt
```

Frontend:

```bash
npm --prefix apps/web install --registry=https://registry.npmmirror.com
```

Use Aliyun first. If one Python package fails, retry only that package with Tsinghua instead of configuring it as a global fallback.

### 4. Configure

```bash
cp env.txt.example .env
```

Common settings:

```text
DEVICE=cuda
WORKFOLDER=./workfolder
MODEL_CACHE_DIR=./data/modelscope
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
YTDLP_PROXY_PORT=
```

The app reads `.env`. Do not commit secrets, cookies, downloaded media, or generated artifacts.

### 5. Run

Backend:

```bash
.venv/bin/uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
npm --prefix apps/web run dev -- --hostname 0.0.0.0 --port 3000
```

Open:

```text
http://localhost:3000
```

## What To Configure In The UI

Open Settings:

1. Paste Netscape-format YouTube cookies.
2. Set the yt-dlp proxy port, for example `20171`.
3. Set OpenAI base URL and API key.
4. Click `Get models` to load model IDs, or enter a model manually.
5. Save settings, return to the main page, paste a YouTube URL, and start.

API keys and cookies are masked in the UI. The backend does not return plaintext cookie content to the frontend.

### How to export YouTube cookies

Use the open-source Chrome extension [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) (cookies never leave your machine):

1. Install the extension and keep it enabled.
2. Sign in to `https://www.youtube.com`.
3. On any youtube.com page, click the extension and choose `Export` → `Netscape` to get `cookies.txt`.
4. Paste the full file content into the Cookie field in Settings.

## Tech Stack

- Frontend: Next.js App Router, shadcn/ui, Lucide icons
- Backend: FastAPI, SQLite
- Download: yt-dlp
- Source separation: Demucs
- ASR: FunASR / SenseVoice
- Translation: OpenAI-compatible Chat Completions API
- TTS: VoxCPM2
- Media: FFmpeg

## Project Status

This is an MVP. The priority is a working end-to-end path with a simple architecture that people can read, run, and modify.

Contributions are welcome:

- Improve installation.
- Support more TTS / ASR / translation backends.
- Improve subtitle styling and portrait/landscape layouts.
- Make YouTube downloading more robust.
- Add task and artifact management.
- Add deployment guides for more environments.

If this project is useful to you, please Star it, Fork it, open Issues or PRs, and share it with people interested in AI video localization and cross-language content.

## Star History

<a href="https://www.star-history.com/?repos=liuzhao1225%2FYouDub-webui&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=liuzhao1225/YouDub-webui&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=liuzhao1225/YouDub-webui&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=liuzhao1225/YouDub-webui&type=date&legend=bottom-right" />
 </picture>
</a>
