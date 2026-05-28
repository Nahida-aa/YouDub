import { newServer } from 'siokit';

export const io = newServer({
	cors: {
		origin: '*',
	},
});
