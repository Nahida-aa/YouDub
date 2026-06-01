import { Hono } from 'hono';
import deviceRoute from '#/ml/device-route';

const app = new Hono();

app.get('/', (c) => {
	return c.text('Hello Hono!');
});
app.route('/api', deviceRoute);

export default app;
