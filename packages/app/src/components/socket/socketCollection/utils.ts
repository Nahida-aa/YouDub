import type { Socket } from 'socket.io-client';

export async function emitAck<T>(
	socket: Socket,
	event: string,
	payload: unknown,
): Promise<T> {
	const res = await socket.emitWithAck(event, payload);
	if (
		typeof res === 'object' &&
		res !== null &&
		'ok' in res &&
		res.ok === false
	) {
		const err = new Error(res.error?.msg ?? 'Unknown error');
		(err as any).code = res.error?.code;
		throw err;
	}
	return res as T;
}
