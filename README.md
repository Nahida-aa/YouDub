# YouDub WebUI

一个尽量简单、可本地运行的 YouTube 中文配音工具。

输入一个 YouTube 链接，配置好 YouTube Cookie 和 OpenAI 兼容 API，YouDub WebUI 会自动下载视频、分离人声、识别字幕、逐句翻译、生成中文配音，并合成带中文字幕和中文配音的新视频。

English README: [README.en.md](README.en.md)

## 为什么做这个项目

现在有很多优秀的视频内容只存在于某一种语言里。YouDub WebUI 希望把「看懂外语视频」这件事变得更简单：不做复杂平台，不做繁重工作流，只保留一个本地可跑、容易理解、方便二次开发的最小系统。

它适合：

- 想把 YouTube 视频转换成中文配音的个人用户。
- 想研究 AI 视频本地化流程的开发者。
- 想基于 Whisper、VoxCPM、OpenAI API、Demucs、FFmpeg 做产品原型的人。
- 想参与开源共建，让跨语言内容传播更容易的人。

## 功能亮点

- 单页 Web 控制台，输入 URL 即可开始。
- 可以在页面里管理 YouTube Cookie、代理端口和 OpenAI 兼容 API 设置。
- 实时查看任务进度，知道当前跑到下载、识别、翻译、配音还是合成。
- 所有流程串行执行，架构简单，方便调试和改造。
- 运行数据保存在本地 SQLite 和本地文件中。
- 默认使用 ModelScope 下载模型，更适合国内网络环境。
- Demucs 使用源码子模块，避免发布版缺少 `demucs.api` 的问题。

## 效果示例

下面是用本项目跑出来的两段真实样例。中文配音版 mp4 托管在本仓库的 [`demo-assets`](https://github.com/liuzhao1225/YouDub-webui/releases/tag/demo-assets) Release 中，点击即可下载播放。

| 视频 | 类型 | 原始英文 | 中文配音版 |
| --- | --- | --- | --- |
| Jensen Huang on Nvidia's Competition | 竖屏 Shorts | [YouTube 原视频](https://www.youtube.com/shorts/TbotsRXyRME) | [下载 jensen_huang_dubbed.mp4](https://github.com/liuzhao1225/YouDub-webui/releases/download/demo-assets/jensen_huang_dubbed.mp4) |
| How much YT paid me for 129 million shorts views | 横屏长视频 | [YouTube 原视频](https://www.youtube.com/watch?v=ii9Kh4XkA5g) | [下载 blastoff_yt_payment_dubbed.mp4](https://github.com/liuzhao1225/YouDub-webui/releases/download/demo-assets/blastoff_yt_payment_dubbed.mp4) |

中文版视频均带有自动生成的中文配音和中文字幕，背景音乐与音效保留自原始视频。

## 工作流程

```text
YouTube URL
  -> yt-dlp 下载
  -> Demucs 分离人声和背景音
  -> Whisper 识别语音（含词级时间戳）
  -> spaCy 重新分句并对齐时间戳
  -> OpenAI 兼容 API 逐句翻译
  -> VoxCPM2 生成中文配音
  -> FFmpeg 合成最终视频
```

## 快速开始

### 1. 准备环境

建议准备：

- Python 3.12
- Node.js 20+
- FFmpeg / ffprobe
- CUDA GPU
- 可用的 YouTube 代理
- Netscape 格式 YouTube Cookie
- OpenAI 兼容 API 的 base URL、API key 和 model

### 2. 克隆项目

```bash
git clone https://github.com/liuzhao1225/YouDub-webui.git
cd YouDub-webui
git submodule update --init --recursive
```

### 3. 安装依赖

Python 依赖：

```bash
python3.12 -m venv .venv
.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt
```

前端依赖：

```bash
npm --prefix apps/web install --registry=https://registry.npmmirror.com
```

下载 spaCy 英文模型（用于 ASR 重新分句）：

```bash
.venv/bin/python -m spacy download en_core_web_sm
```

如果 Aliyun 某个 Python 包暂时不可用，再单独对那个包使用 Tsinghua 源重试。不要把 Tsinghua 配成全局 fallback。

### 4. 配置环境

```bash
cp env.txt.example env.txt
cp env.txt.example .env
```

常用配置：

```text
DEVICE=cuda
WORKFOLDER=./workfolder
MODEL_CACHE_DIR=./data/modelscope
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
YTDLP_PROXY_PORT=
```

`.env` 用于应用运行，`env.txt` 方便本地记录和修改配置。不要提交任何密钥、Cookie 或下载产物。

### 5. 启动

启动后端：

```bash
.venv/bin/uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

启动前端：

```bash
npm --prefix apps/web run dev -- --hostname 0.0.0.0 --port 3000
```

打开：

```text
http://localhost:3000
```

## 页面里需要配置什么

打开页面后，进入 Settings：

1. 粘贴 Netscape 格式 YouTube Cookie。
2. 填写 yt-dlp 代理端口，例如 `20171`。
3. 填写 OpenAI base URL 和 API key。
4. 点击 `Get models` 获取可选模型，或手动输入模型名。
5. 保存后回到首页，输入 YouTube URL，开始转换。

API key 和 Cookie 会在页面中脱敏显示，后端不会把 Cookie 明文返回给前端。

任务详情页底部提供 **Danger zone**，确认后会调用 `DELETE /api/tasks/{id}`，同时清理 SQLite 记录、运行日志以及 `workfolder/` 下整段会话目录。运行中的任务无法删除。

## 技术栈

- Frontend: Next.js App Router, shadcn/ui, Lucide icons
- Backend: FastAPI, SQLite
- Download: yt-dlp
- Source separation: Demucs
- ASR: openai-whisper（默认 large-v3-turbo）+ spaCy 句子重分割
- Translation: OpenAI-compatible Chat Completions API
- TTS: VoxCPM2
- Media: FFmpeg

## 项目状态

这是一个 MVP。当前重点是把最短链路跑通，并保持架构足够简单，方便大家阅读、运行和改造。

欢迎共建：

- 改进安装体验。
- 适配更多 TTS / ASR / 翻译模型。
- 优化字幕样式和横竖屏视频布局。
- 提升下载稳定性。
- 增加任务管理和结果管理。
- 补充不同平台的部署指南。

如果这个项目对你有帮助，欢迎 Star、Fork、提交 Issue 或 PR。也欢迎把它分享给对 AI 视频本地化、开源工具和跨语言内容传播感兴趣的人。

## Star History

<a href="https://www.star-history.com/?repos=liuzhao1225%2FYouDub-webui&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=liuzhao1225/YouDub-webui&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=liuzhao1225/YouDub-webui&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=liuzhao1225/YouDub-webui&type=date&legend=bottom-right" />
 </picture>
</a>
