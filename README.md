# YouDub WebUI

最简本地 YouTube 中文配音控制台。同一个仓库里包含 Next.js 前端和 FastAPI 后端，使用 SQLite 和本地文件保存运行状态与产物。当前版本只支持单个活动任务，所有阶段串行执行。

英文版见 [README.en.md](README.en.md)。

## 快速说明

输入一个 YouTube 视频 URL 后，系统按固定顺序执行：

1. `download`：yt-dlp 下载视频。
2. `separate`：Demucs 分离人声和背景音。
3. `asr`：FunASR / SenseVoice 识别语音。
4. `translate`：OpenAI 兼容 Chat API 逐句翻译为简体中文。
5. `split_audio`：按翻译片段切出人声参考音频。
6. `tts`：VoxCPM2 生成中文配音。
7. `merge_audio`：把配音拼回原时间轴。
8. `merge_video`：FFmpeg 合成最终视频和字幕。

这个 MVP 不包含 Redis、Postgres、多 worker、并行队列、播放列表/频道监控、B 站上传、封面编辑或多用户系统。

## 安装准备

建议环境：

- Python 3.12
- Node.js 20+ 和 npm
- FFmpeg / ffprobe
- Git submodule 支持
- CUDA GPU，远端测试使用 GPU1
- 可用的 YouTube 代理，例如本地 `127.0.0.1:20171`
- 有效的 Netscape 格式 YouTube cookie
- OpenAI 兼容 API 的 base URL、API key 和 model

安装源规则：

- Python 包默认优先使用 Aliyun：`https://mirrors.aliyun.com/pypi/simple/`
- npm 默认使用 npmmirror：`https://registry.npmmirror.com`
- 不要把 Tsinghua 配成 `--extra-index-url`，pip 可能从备用源选包。
- Aliyun 某个包失败时，再单独用 Tsinghua 重试那个包。

## 本地安装

克隆仓库：

```bash
cd /Users/liuzhao/code
git clone git@github.com:liuzhao1225/YouDub-webui.git
cd YouDub-webui
```

创建 Python 虚拟环境并安装后端依赖：

```bash
python3.12 -m venv .venv
.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt
```

如果 Aliyun 某个包失败，只对那个包使用 Tsinghua：

```bash
.venv/bin/pip install -i https://pypi.tuna.tsinghua.edu.cn/simple/ <package-name>
```

初始化 Demucs 源码子模块：

```bash
git submodule update --init --recursive
```

安装前端依赖：

```bash
npm --prefix apps/web install --registry=https://registry.npmmirror.com
```

准备运行环境变量：

```bash
cp env.txt.example env.txt
cp env.txt.example .env
```

Codex 不直接读取或编辑 `.env`。需要调整环境变量时，优先编辑 `env.txt`，确认后再把值同步到 `.env`。应用代码仍然从 `.env` 读取运行配置。

常用环境变量：

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

`YTDLP_PROXY_PORT` 只填端口，例如 `20171`。后端会转换为 `http://127.0.0.1:20171` 给 yt-dlp 使用。不配置端口时，yt-dlp 仍可 fallback 到 `HTTP_PROXY` / `http_proxy`。

## 本地启动

启动后端：

```bash
.venv/bin/uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

启动前端开发服务：

```bash
npm --prefix apps/web run dev -- --hostname 0.0.0.0 --port 3000
```

打开：

```text
http://localhost:3000
```

前端生产构建需要在构建时指定 API 地址，因为 `NEXT_PUBLIC_API_BASE_URL` 会被编译进浏览器代码：

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm --prefix apps/web run build
npm --prefix apps/web run start -- --hostname 0.0.0.0 --port 3000
```

## 远端 GPU 部署

开发和测试使用的远端部署信息：

```text
Host: gil-gpu
Path: /data1/liuzhao/YouDub-webui
GPU: CUDA_VISIBLE_DEVICES=1
Web: http://172.27.2.90:3000
API: http://172.27.2.90:8000
tmux: youdub-api, youdub-web
Proxy: 127.0.0.1:20171
```

拉取代码并安装依赖：

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

建议把模型和 torch cache 放到大盘：

```bash
export CUDA_VISIBLE_DEVICES=1
export DEVICE=cuda
export MODEL_CACHE_DIR=/data1/liuzhao/modelscope_cache
export MODELSCOPE_CACHE=/data1/liuzhao/modelscope_cache
export TORCH_HOME=/data1/liuzhao/torch_cache
```

启动后端：

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

构建并启动前端：

```bash
NEXT_PUBLIC_API_BASE_URL=http://172.27.2.90:8000 npm --prefix apps/web run build
tmux kill-session -t youdub-web 2>/dev/null || true
tmux new-session -d -s youdub-web "\
cd /data1/liuzhao/YouDub-webui && \
NEXT_PUBLIC_API_BASE_URL=http://172.27.2.90:8000 \
npm --prefix apps/web run start -- --hostname 0.0.0.0 --port 3000"
```

检查服务：

```bash
curl -sS http://127.0.0.1:8000/api/health
curl -I http://127.0.0.1:3000
tmux ls
ss -ltnp | grep -E ":(3000|8000) "
```

如果要用 Tailscale IP 访问前端，需要用对应 API IP 重新构建：

```bash
NEXT_PUBLIC_API_BASE_URL=http://100.94.222.54:8000 npm --prefix apps/web run build
```

## 首次使用

1. 打开 Web 页面。
2. 点击 `Settings`。
3. 粘贴 Netscape 格式 YouTube cookie。
4. 设置 `yt-dlp proxy port`，例如 `20171`。
5. 设置 OpenAI base URL、API key 和 model。
6. 可点击 `Get models` 从 OpenAI 兼容 API 拉取模型列表。
7. 保存设置。
8. 在主界面输入 YouTube URL 并开始转换。

敏感信息显示规则：

- 已保存 API key 显示为 `********`。
- 已保存 YouTube cookie 显示为占位文本，不会从后端返回明文。
- 如果没有编辑 mask，占位值不会覆盖真实 secret。

## 项目结构

```text
apps/web/                 Next.js 前端
apps/web/src/app/         单页控制台和全局样式
apps/web/src/components/  shadcn/ui 风格组件
apps/web/src/lib/api.ts   前端 API client
backend/app/              FastAPI、SQLite repository、pipeline runner
backend/app/adapters/     yt-dlp、Demucs、FunASR、OpenAI、VoxCPM、FFmpeg 适配器
backend/tests/            后端测试
data/                     SQLite、cookies、logs，git 忽略
workfolder/               视频任务产物，git 忽略
submodule/demucs/         Demucs 源码子模块
env.txt.example           环境变量模板
requirements.txt          Python 依赖
```

## 前端

前端是单页竖向布局：

1. `Convert video`
2. `Progress`
3. `Task log`

主题为亮色，使用 YouTube 红、B 站蓝、B 站粉。任务进度通过每 2 秒轮询 `GET /api/tasks/current` 获取，不使用 SSE 或 WebSocket。

## 后端 API

任务接口：

- `POST /api/tasks`：提交单个 YouTube URL；已有任务运行时返回 `409`。
- `GET /api/tasks/current`：当前或最近任务。
- `GET /api/tasks/{id}`：任务详情和阶段状态。
- `GET /api/tasks/{id}/log`：任务日志文本。
- `GET /api/tasks/{id}/artifact/final-video`：下载最终视频。

设置接口：

- `GET /api/cookies/youtube`：返回 cookie 元信息，不返回 cookie 内容。
- `POST /api/cookies/youtube`：保存 Netscape 格式 YouTube cookie。
- `GET /api/settings/openai`：读取 OpenAI base URL、model、`has_api_key` 和脱敏 API key。
- `POST /api/settings/openai`：保存 OpenAI base URL、API key 和 model。
- `POST /api/settings/openai/models`：从 OpenAI 兼容 `/models` 接口拉取模型 ID。
- `GET /api/settings/ytdlp`：读取 yt-dlp proxy port。
- `POST /api/settings/ytdlp`：保存 yt-dlp proxy port。
- `GET /api/health`：健康检查。

## 运行数据和产物

运行状态保存在本地：

- `data/youdub.sqlite`：SQLite 数据库。
- `data/cookies/youtube.txt`：Netscape 格式 YouTube cookie。
- `data/logs/{task_id}.log`：任务日志。
- `workfolder/{uploader_slug}/{title_slug}__{video_id}/`：任务工作目录。

关键产物：

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

Demucs 必须作为源码子模块使用：

```text
submodule/demucs
```

当前代码导入 `demucs.api.Separator`。PyPI 发布版不作为主要来源，因为需要的 API 来自源码树。运行前必须执行：

```bash
git submodule update --init --recursive
```

## yt-dlp

下载格式优先对齐旧 `youdub-backend`：

```text
bestvideo[height<=1080]+bestaudio/best
```

失败后依次回退：

```text
bestvideo+bestaudio/best
bv*+ba/b
best
```

项目依赖 `yt-dlp[default]`，会安装 `yt-dlp-ejs`。后端 adapter 也启用 Node JavaScript runtime：

```python
js_runtimes={"node": {}}
```

这用于解决 YouTube n-challenge。远端必须能在 `PATH` 中找到 `node`。

常见下载失败原因：

- 代理 IP 被 YouTube 429 限流。
- cookie 过期、缺字段或被浏览器轮换。
- YouTube 要求登录确认不是 bot。

遇到 `cookies are no longer valid` 或 `Sign in to confirm you're not a bot` 时，需要重新从已登录 YouTube 的浏览器导出 Netscape cookie 并在 Settings 中保存。

## 模型

默认模型：

- FunASR：`iic/SenseVoiceSmall`
- FunASR VAD：`fsmn-vad`
- VoxCPM：`OpenBMB/VoxCPM2`

模型下载优先用 ModelScope。VoxCPM2 通过 `modelscope.snapshot_download` 下载。建议设置：

```text
MODEL_CACHE_DIR=/data1/liuzhao/modelscope_cache
MODELSCOPE_CACHE=/data1/liuzhao/modelscope_cache
TORCH_HOME=/data1/liuzhao/torch_cache
```

已验证过的远端缓存路径：

```text
/data1/liuzhao/modelscope_cache/OpenBMB__VoxCPM2
/data1/liuzhao/modelscope_cache/models/iic/SenseVoiceSmall
/data1/liuzhao/modelscope_cache/models/iic/speech_fsmn_vad_zh-cn-16k-common-pytorch
/data1/liuzhao/torch_cache/hub/checkpoints
```

Demucs 权重由上游 Demucs 代码下载到 PyTorch hub cache。

## 测试

后端：

```bash
.venv/bin/pytest backend/tests
```

前端：

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

当前测试覆盖：

- YouTube URL 校验。
- cookie 和 API key 脱敏。
- OpenAI models 接口。
- yt-dlp proxy port 校验。
- yt-dlp 格式选择顺序和 Node EJS runtime。
- 固定串行阶段状态推进。
- mock 完整 pipeline 成功和失败。
- 逐句翻译请求行为。
- FFmpeg helper 行为。

## 当前限制

- 同一时间只支持一个活动任务。
- 暂无任务取消接口。
- 暂无任务删除和清理 UI。
- 暂无播放列表/频道监控。
- 暂无 B 站上传。
- 暂无用户系统或多用户安全模型。
- YouTube cookie 明文保存在本地。
- OpenAI API key 明文保存在本地。
- 前端轮询进度，不流式显示真实日志。

## 运维注意事项

- 不要提交 `.env`、`data/`、`workfolder/`、模型缓存、下载视频和 cookie。
- YouTube cookie 失效时重新导出。
- 服务器需要代理时，在 Settings 里设置 proxy port。
- 前端生产构建时确认 `NEXT_PUBLIC_API_BASE_URL` 指向用户实际能访问的 API 地址。
- 依赖安装优先 Aliyun；Tsinghua 只作为单包手动 fallback。
