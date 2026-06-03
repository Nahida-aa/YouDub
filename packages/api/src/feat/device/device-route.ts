import { Hono } from 'hono';
import { getDeviceInfo } from './device-info';

const deviceRoute = new Hono();

deviceRoute.get('/device/info', async (c) => {
	const info = await getDeviceInfo();
	return c.json(info);
});

export default deviceRoute;
