import { newServer } from 'siokit';
import type { ClientToServerEvents, ServerToClientEvents } from '#/ws/types.ts';

export const io = newServer<ClientToServerEvents, ServerToClientEvents>({
	cors: {
		origin: '*',
	},
});
