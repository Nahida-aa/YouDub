import { Hono } from 'hono';
import deviceRoute from '#/feat/device/device-route.ts';

const app = new Hono();

app.get('/', (c) => {
	return c.text('Hello Hono!');
});
app.route('/api', deviceRoute);

export default app;
