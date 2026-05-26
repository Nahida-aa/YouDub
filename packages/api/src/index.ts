import {  websocket } from 'hono/bun'
import app from './app'
import { engine } from '#/socket.io/api.ts';

const socketIo = engine.handler()
export default {
  port: 9007,
  idleTimeout: 30, // must be greater than the "pingInterval" option of the engine, which defaults to 25 seconds
  fetch: app.fetch,
  // websocket,
  websocket: socketIo.websocket,
  maxRequestBodySize: socketIo.websocket
}
