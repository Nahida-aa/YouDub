type TransportName = "polling" | "websocket" | "webtransport";
import type { CorsOptions, CorsOptionsDelegate } from "cors";
export interface EioOptions {
  /**
   * how many ms without a pong packet to consider the connection closed
   * @default 20000
   */
  pingTimeout?: number;
  /**
   * how many ms before sending a new ping packet
   * @default 25000
   */
  pingInterval?: number;
  /**
   * how many ms before an uncompleted transport upgrade is cancelled
   * @default 10000
   */
  upgradeTimeout?: number;
    /**
   * how many bytes or characters a message can be, before closing the session (to avoid DoS).
   * @default 1e5 (1000 KB)
   */
  maxHttpBufferSize?: number;
    /**
   * The low-level transports that are enabled. WebTransport is disabled by default and must be manually enabled:
   *
   * @example
   * new Server({
   *   transports: ["polling", "websocket", "webtransport"]
   * });
   *
   * @default ["polling", "websocket"]
   */
  transports?: TransportName[];

    /**
   * the options that will be forwarded to the cors module
   */
  cors?: CorsOptions | CorsOptionsDelegate;
}
export const newEioOptions = (opts?:EioOptions) => ({
  pingTimeout: opts?.pingTimeout ?? 20000,
  pingInterval: opts?.pingInterval ?? 25000,
  upgradeTimeout: opts?.upgradeTimeout ?? 10000, 
  maxHttpBufferSize: opts?.maxHttpBufferSize ?? 1e6, // 1000000
  transports: opts?.transports ?? ["polling", "websocket"],
} satisfies EioOptions)