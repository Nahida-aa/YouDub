import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";

const io = new Server();

export const engine = new Engine({
  path: "/ws/",
});

io.bind(engine);

io.on("connection", (socket) => {
  // ...
  console.log("New client connected:", socket.id);
});