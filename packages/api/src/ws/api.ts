import { Hono,  } from 'hono'
// import {  } from 'hono/'
import { upgradeWebSocket } from 'hono/bun'
import { SioPacketSchema, SubscribeSchema } from './types'
import { sioEncode } from '#/sokit/io/encode.ts';
import { Decoder } from '#/sokit/io/decode.ts';
import { Packet as EioPacket, PACKET_TYPES, PacketTypes, PacketTypesReverse } from '#/sokit/io/engine/commons.ts';
import { Packet, PacketType } from '#/sokit/io/types.ts';
import { eioEncode } from '#/sokit/io/engine/parser.ts';
import { EioOptions, newEioOptions } from '#/io/engine/server.ts';
const app = new Hono()
const PYTHON_BACKEND = 'http://localhost:8000'
// 存储活跃的订阅定时器，每个 WS 连接维护自己的订阅状态
const subscriptions = new Map<string, { [topic: string]: Timer }>()
type WS<T = any> = {
  send: (data: string | ArrayBuffer | Uint8Array<ArrayBuffer>) => void;
  close: (...p: any[]) => void;
}
const eioOptions = newEioOptions({
  // pingInterval: 2000, // test with short intervals
})
const eioOpenPacket =(sid: string) => ({
  type: "open",
  data: JSON.stringify({
    sid,
    maxPayload: eioOptions.maxHttpBufferSize,
    pingInterval: eioOptions.pingInterval,
    pingTimeout: eioOptions.pingTimeout,
    upgrades: []
  })
} satisfies EioPacket)
const sioConnectPacket = (sid: string) => ({
  type: PacketType.CONNECT,
  data: {
    sid,
  }
} satisfies Packet)
app.get(
  '/ws/',
  upgradeWebSocket((c) => {
    const sid = Math.random().toString(36).slice(2)
    const decoder = new Decoder();
    let pingIntervalTimer: Timer;
    let pingTimeoutTimer: Timer;
    let currentWs: WS | undefined = undefined; // 存储 ws 引用，方便在函数中使用
    // 2. 提前定义 schedulePing 函数
  const schedulePing = () => {
    // 每次启动前先清理旧的，确保唯一性
    clearTimeout(pingIntervalTimer);
    
    pingIntervalTimer = setTimeout(() => {
      currentWs?.send(PACKET_TYPES.ping); // 发送 "2"

      // 启动超时监测
      clearTimeout(pingTimeoutTimer);
      pingTimeoutTimer = setTimeout(() => {
        currentWs?.close();
      }, eioOptions.pingTimeout); // 20s 超时
    }, eioOptions.pingInterval); // 25s 间隔
  };

  const resetHeartbeat = () => {
    clearTimeout(pingTimeoutTimer);
    clearTimeout(pingIntervalTimer);
    schedulePing();
  };
    return {
      onOpen(event, ws) {
        currentWs = ws; // 保存引用
       
        const data = {
          EIO: c.req.query('EIO'), // 4
          transport: c.req.query('transport'), // websocket
        }
        subscriptions.set(sid, {})
        const packet = eioOpenPacket(sid)
        eioEncode([packet], (encodedPayload) => {
          console.log(`[WS] Sending OPEN packet to ${sid}:`, encodedPayload)
          ws.send(encodedPayload)
        })
        // console.log(`[WS] Sending OPEN packet to ${sid}:`,  {
        //   input: data,
        //   output: encoded
        // })
        // ws.send(encoded[0])
        
        decoder.on("decoded", (packet) => {
          console.log(`[WS] Decoded packet from ${sid}:`, packet)
          if (packet.type === PacketType.CONNECT) {
            console.log(`[WS] Client ${sid} requested connection to nsp: ${packet.nsp}`);
            const encoded = sioEncode(sioConnectPacket(sid))
            console.log(`[WS] Sending CONNECT packet to ${sid}:`, encoded)
            ws.send(`${PACKET_TYPES.message}${encoded[0]}`)
            schedulePing()
          }
          // sioEncode(packet).forEach((item) => {
          //   console.log(`[WS] Sending to ${sid}:`, item)
          //   // ws.send(item)
          // })
        })
        // encoded.forEach((item) => {
        //   console.log(`[WS] Sending to ${sid}:`, item)
        //   ws.send(item)
        // })

      },
      onMessage(event, ws) {
        try {
          const rawText = event.data.toString()
          const engineType = rawText[0] as keyof PacketTypesReverse
          const payloadString = rawText.slice(1) // 去掉 Engine.IO 的类型码
          console.log(`[WS] Received raw message from ${sid}:`, { engineType, payloadString })
          if (engineType === PACKET_TYPES.message) {
            decoder.add(payloadString)
          } else if (engineType === PACKET_TYPES.pong) {
            // 收到 PONG，重置所有定时器
            resetHeartbeat()
          } else {
            console.log(`[WS] Unhandled Engine.IO type: ${engineType}`);
          }
          // // 1. 验证 Socket.io 兼容格式: [event, data]
          // const rawData = JSON.parse(rawText)
          // const result = SioPacketSchema.safeParse(rawData)
          // if (!result.success) return

          // const [eventName, payload] = result.data

          // // 2. 处理订阅逻辑
          // if (eventName === 'subscribe') {
          //   const subResult = SubscribeSchema.safeParse(payload)
          //   if (!subResult.success) return

          //   const { topic, id } = subResult.data
          //   const topicKey = id ? `${topic}:${id}` : topic
          //   const userSubs = subscriptions.get(sid)

          //   if (userSubs && !userSubs[topicKey]) {
          //     console.log(`[WS] ${sid} subscribed to ${topicKey}`)
              
          //     // 启动定时代理轮询
          //     userSubs[topicKey] = setInterval(async () => {
          //       try {
          //         let data;
          //         if (topic === 'tasks:list') {
          //           const res = await fetch(`${PYTHON_BACKEND}/api/tasks`)
          //           data = await res.json()
          //         } else if (topic === 'tasks:detail' && id) {
          //           const res = await fetch(`${PYTHON_BACKEND}/api/tasks/${id}`)
          //           data = await res.json()
          //         } else if (topic === 'tasks:log' && id) {
          //           const res = await fetch(`${PYTHON_BACKEND}/api/tasks/${id}/log`)
          //           data = await res.text() // 日志通常是文本
          //         }

          //         if (data) {
          //           // 推送格式: ["topic", data]
          //           ws.send(JSON.stringify([topicKey, data]))
          //         }
          //       } catch (err) {
          //         console.error(`[WS] Proxy error for ${topicKey}:`, err)
          //       }
          //     }, 2000)
          //   }
          // }

          // // 3. 处理取消订阅逻辑
          // if (eventName === 'unsubscribe') {
          //   const subResult = SubscribeSchema.safeParse(payload)
          //   if (!subResult.success) return
            
          //   const { topic, id } = subResult.data
          //   const topicKey = id ? `${topic}:${id}` : topic
          //   const userSubs = subscriptions.get(sid)

          //   if (userSubs && userSubs[topicKey]) {
          //     console.log(`[WS] ${sid} unsubscribed from ${topicKey}`)
          //     clearInterval(userSubs[topicKey])
          //     delete userSubs[topicKey]
          //   }
          // }

        } catch (err) {
          console.error('[WS] Message error:', err)
        }
      },
      onClose() {
        console.log(`[WS] Connection closed: ${sid}`)
        // --- 关键：防止内存泄漏 ---
        clearTimeout(pingIntervalTimer);
        clearTimeout(pingTimeoutTimer);
        const userSubs = subscriptions.get(sid)
        if (userSubs) {
          Object.values(userSubs).forEach(clearInterval)
          subscriptions.delete(sid)
        }
      },
    }
  })
)
export default app