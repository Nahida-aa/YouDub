import {  websocket } from 'hono/bun'
import app from './app'


export default {
  port: 9007,
  fetch: app.fetch,
  websocket,
}
