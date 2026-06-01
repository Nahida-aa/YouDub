// import { Hono } from 'hono';
// import { upgradeWebSocket } from 'hono/bun';
// import { newServer, type WsSession } from 'siokit';
// import { io } from '#/ws/route.ts';

// // import { io } from '#/ws/io.ts';

// const app = new Hono();

// app.get(
// 	'/ws/',
// 	upgradeWebSocket((c) => {
// 		let session: WsSession | null = null;
// 		return {
// 			onOpen(_event, ws) {
// 				const transport = {
// 					send: (data: string | Uint8Array) =>
// 						ws.send(data as string | ArrayBuffer | Uint8Array<ArrayBuffer>),
// 				};
// 				session = io.createWsSession(transport);
// 			},
// 			onMessage(event, ws) {
// 				session!.handleData(event.data);
// 			},
// 			onClose(_event, ws) {
// 				session?.close('transport close');
// 			},
// 		};
// 	}),
// );
// export default app;
// export { io };
