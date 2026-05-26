import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import { SioPacketSchema, SubscribeSchema } from './types'
import { ioEncode } from '#/io/encode.ts';
import { Decoder } from '#/io/decode.ts';
const app = new Hono()
const PYTHON_BACKEND = 'http://localhost:8000'
// 存储活跃的订阅定时器，每个 WS 连接维护自己的订阅状态
const subscriptions = new Map<string, { [topic: string]: Timer }>()

app.get(
  '/ws/',
  upgradeWebSocket((c) => {
    const wsId = Math.random().toString(36).slice(2)
    const decoder = new Decoder();
    return {
      onOpen(event, ws) {
        const data = {
          EIO: c.req.query('EIO'), // 4
          transport: c.req.query('transport'), // websocket
        }
        subscriptions.set(wsId, {})
        const packet = {
          type: 0,
          nsp: '/',
          data: {
            sid: wsId,
            maxPayload: 1e6,
            pingInterval: 25000,
            pingTimeout: 20000,
            upgrades: []
          }
        }
        const encoded = ioEncode(packet)
        console.log(`[WS] Sending OPEN packet to ${wsId}:`,  {
          input: data,
          output: encoded
        })
        ws.send(encoded[0])
        decoder.on("decoded", (packet) => {
          console.log(`[WS] Decoded packet from ${wsId}:`, packet)
        })
        // encoded.forEach((item) => {
        //   console.log(`[WS] Sending to ${wsId}:`, item)
        //   ws.send(item)
        // })
        //         // 1. 发送 Engine.IO "OPEN" 包 (代码 0)
        // // 包含 sid, 升级选项, 心跳间隔和超时时间
        // const openPacket = {
        //   sid: wsId,
        //   upgrades: [],
        //   pingInterval: 25000,
        //   pingTimeout: 5000
        // }
        // ws.send(`0${JSON.stringify(openPacket)}`)

        // // 2. 发送 Socket.IO "CONNECT" 包 (代码 40)
        // // 告诉客户端 Socket.io 层的连接已建立
        // ws.send('40')
      },
      onMessage(event, ws) {
        try {
          // 1. 验证 Socket.io 兼容格式: [event, data]
          const rawText = event.data.toString()
          const engineType = rawText[0]
          const payloadString = rawText.slice(1) // 去掉 Engine.IO 的类型码
          const rawData = JSON.parse(rawText)
          console.log(`[WS] Received from ${wsId}:`, rawData)
          if (engineType === '4') {

          }
          const result = SioPacketSchema.safeParse(rawData)
          if (!result.success) return

          const [eventName, payload] = result.data

          // 2. 处理订阅逻辑
          if (eventName === 'subscribe') {
            const subResult = SubscribeSchema.safeParse(payload)
            if (!subResult.success) return

            const { topic, id } = subResult.data
            const topicKey = id ? `${topic}:${id}` : topic
            const userSubs = subscriptions.get(wsId)

            if (userSubs && !userSubs[topicKey]) {
              console.log(`[WS] ${wsId} subscribed to ${topicKey}`)
              
              // 启动定时代理轮询
              userSubs[topicKey] = setInterval(async () => {
                try {
                  let data;
                  if (topic === 'tasks:list') {
                    const res = await fetch(`${PYTHON_BACKEND}/api/tasks`)
                    data = await res.json()
                  } else if (topic === 'tasks:detail' && id) {
                    const res = await fetch(`${PYTHON_BACKEND}/api/tasks/${id}`)
                    data = await res.json()
                  } else if (topic === 'tasks:log' && id) {
                    const res = await fetch(`${PYTHON_BACKEND}/api/tasks/${id}/log`)
                    data = await res.text() // 日志通常是文本
                  }

                  if (data) {
                    // 推送格式: ["topic", data]
                    ws.send(JSON.stringify([topicKey, data]))
                  }
                } catch (err) {
                  console.error(`[WS] Proxy error for ${topicKey}:`, err)
                }
              }, 2000)
            }
          }

          // 3. 处理取消订阅逻辑
          if (eventName === 'unsubscribe') {
            const subResult = SubscribeSchema.safeParse(payload)
            if (!subResult.success) return
            
            const { topic, id } = subResult.data
            const topicKey = id ? `${topic}:${id}` : topic
            const userSubs = subscriptions.get(wsId)

            if (userSubs && userSubs[topicKey]) {
              console.log(`[WS] ${wsId} unsubscribed from ${topicKey}`)
              clearInterval(userSubs[topicKey])
              delete userSubs[topicKey]
            }
          }

        } catch (err) {
          console.error('[WS] Message error:', err)
        }
      },
      onClose() {
        console.log(`[WS] Connection closed: ${wsId}`)
        const userSubs = subscriptions.get(wsId)
        if (userSubs) {
          Object.values(userSubs).forEach(clearInterval)
          subscriptions.delete(wsId)
        }
      },
    }
  })
)
export default app