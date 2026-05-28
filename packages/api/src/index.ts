import app from './app'
import { engine } from '#/socket.io/api.ts';
import { websocket } from 'hono/bun'
const socketIo = engine.handler();

export default {
  port: 9007,
  idleTimeout: 60, 
  fetch(req: Request, server: any) {
    // 拦截 Socket.IO 请求
    // if (req.url.includes('/ws/')) {
    //   return socketIo.fetch(req, server);
    // }
    // 其他请求交给 Hono
    return app.fetch(req, server);
  },
  websocket,
  // websocket: socketIo.websocket,
}
