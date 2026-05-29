import { Hono } from 'hono';

const app = new Hono();

import wsApi from './ws/api';

app.get('/', (c) => {
	return c.text('Hello Hono!');
});
// .route('', wsApi)

export default app;
