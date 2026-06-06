# cli

CLI 端 + core。通过 `config.json` 配置即可运行完整流水线。

## 用法

```bash
cd packages/cli

# 编辑 config.json → 设置 command + 参数 + engines

# 运行
bun run run
```

## config 示例

```json
{
  "$schema": "./config.schema.json",
  "command": "createTask",
  "createTask": {
    "sourceFile": "https://github-production-user-asset-6210df.s3.amazonaws.com/15737086/581823231-bd02936f-cf3c-4e4b-85b5-0410d38f69f5.mp4",
    "sourceLang": "auto",
    "targetLang": "zh"
  },
  "engines": {
    "separate": {
      "runtime": "pytorch",
        "device": "cuda"
    },
    "asr": {
      "runtime": "faster-whisper",
      "device": "cuda"
    },
    "tts": {
      "runtime": "pytorch",
      "device": "cuda"
    }
  }
}
```

## 引擎说明

| stage | runtime | 说明 |
|---|---|---|
| separate | `ort` / `pytorch` | ort=onnxruntime-node(CPU), pytorch=Demucs Python 子进程(cuda/mps/cpu) |
| asr | `faster-whisper` / `pytorch` | faster-whisper=CTranslate2, pytorch=openai-whisper |
| tts | `ort` / `pytorch` / `cloud` | ort=onnxruntime-node,VoxCPM, pytorch=VoxCPM Python 子进程, cloud=远程 API |
| translate | — | OpenAI 兼容 API，从环境变量读取 |

## 其他命令

```jsonc
// 查看任务状态
{ "command": "taskStatus", "taskStatus": { "taskId": "xxx" } }

// 从指定 stage 恢复
{ "command": "resumeTask", "resumeTask": { "taskId": "xxx", "resumeFrom": "tts" } }

// 重跑单个 stage
{ "command": "rerunStage", "rerunStage": { "taskId": "xxx", "stageName": "tts" } }

// 查看设备信息
{ "command": "deviceInfo" }
```
