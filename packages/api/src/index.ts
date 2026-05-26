import {  websocket } from 'hono/bun'
import app from './app'
// import { engine } from '#/socket.io/api.ts';

export default {
  port: 9007,
  idleTimeout: 30, // must be greater than the "pingInterval" option of the engine, which defaults to 25 seconds
  fetch: app.fetch,
  websocket,
  // ...engine.handler()
}
