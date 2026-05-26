import { reconstructPacket } from "./binary.ts";
import { Emitter } from "./emitter.o.ts";
import { isBinary } from "./is-binary.ts";
import { Packet, PacketType } from "./types.ts";

/**
 * These strings must not be used as event names, as they have a special meaning.
 */
const RESERVED_EVENTS = [
  "connect", // used on the client side
  "connect_error", // used on the client side
  "disconnect", // used on both sides
  "disconnecting", // used on the server side
  "newListener", // used by the Node.js EventEmitter
  "removeListener", // used by the Node.js EventEmitter
];

// see https://caniuse.com/mdn-javascript_builtins_number_isinteger
const isInteger =
  Number.isInteger ||
  function (value) {
    return (
      typeof value === "number" &&
      isFinite(value) &&
      Math.floor(value) === value
    );
  };

function isAckIdValid(id: unknown) {
  return id === undefined || isInteger(id);
}

class BinaryReconstructor {
  private reconPack: Packet | null;
  private buffers: Array<Buffer | ArrayBuffer> = [];

  constructor(readonly packet: Packet) {
    this.reconPack = packet;
  }

  /**
   * Method to be called when binary data received from connection
   * after a BINARY_EVENT packet.
   *
   * @param {Buffer | ArrayBuffer} binData - the raw binary data received
   * @return {null | Object} returns null if more binary data is expected or
   *   a reconstructed packet object if all buffers have been received.
   */
  public takeBinaryData(binData: Buffer | ArrayBuffer) {
    this.buffers.push(binData);
    if (this.buffers.length === this.reconPack?.attachments) {
      // done with buffer list
      const packet = reconstructPacket(this.reconPack, this.buffers);
      this.finishedReconstruction();
      return packet;
    }
    return null;
  }

  /**
   * Cleans up binary packet reconstruction variables.
   */
  public finishedReconstruction() {
    this.reconPack = null;
    this.buffers = [];
  }
}

type JSONReviver = (this: any, key: string, value: any) => any;

export interface DecoderOptions {
  /**
   * Custom reviver to pass down to JSON.parse()
   */
  reviver?: JSONReviver | undefined;
  /**
   * Maximum number of binary attachments per packet
   * @default 10
   */
  maxAttachments?: number;
}
interface DecoderReservedEvents {
  decoded: (packet: Packet) => void;
}

export class Decoder extends Emitter<{}, {}, DecoderReservedEvents> {
  private reconstructor: BinaryReconstructor | null = null;
  private opts: DecoderOptions;
  constructor(opts?: DecoderOptions | JSONReviver) {
      super();
    this.opts = Object.assign(
      {
        reviver: undefined,
        maxAttachments: 10,
      },
      typeof opts === "function" ? { reviver: opts } : opts,
    );
  }
  public add(obj: any) {
    let packet;
    if (typeof obj === "string") {
      if (this.reconstructor) {
        throw new Error("got plaintext data when reconstructing a packet");
      }
      packet = this._decodeString(obj);
      const isBinaryEvent = packet.type === PacketType.BINARY_EVENT;
      if (isBinaryEvent || packet.type === PacketType.BINARY_ACK) {
        packet.type = isBinaryEvent ? PacketType.EVENT : PacketType.ACK;
        // binary packet's json
        this.reconstructor = new BinaryReconstructor(packet);

        // no attachments, labeled binary but no binary data to follow
        if (packet.attachments === 0) {
          super.emitReserved("decoded", packet);
        }
      } else {
        // non-binary full packet
        super.emitReserved("decoded", packet);
      }
    } else if (isBinary(obj) || obj.base64) {
      // raw binary data
      if (!this.reconstructor) {
        throw new Error("got binary data when not reconstructing a packet");
      } else {
        packet = this.reconstructor.takeBinaryData(obj);
        if (packet) {
          // received final buffer
          this.reconstructor = null;
          super.emitReserved("decoded", packet);
        }
      }
    } else {
      throw new Error("Unknown type: " + obj);
    }
  }

  public _decodeString = (str: string): Packet => {
    let i = 0;
    // look up type
    const p: Packet = {
      type: Number(str.charAt(0)),
    };

    if (PacketType[p.type] === undefined) {
      throw new Error("unknown packet type " + p.type);
    }

    // look up attachments if type binary
    if (
      p.type === PacketType.BINARY_EVENT ||
      p.type === PacketType.BINARY_ACK
    ) {
      const start = i + 1;
      while (str.charAt(++i) !== "-" && i != str.length) {}
      const buf = str.substring(start, i);
      // @ts-expect-error - 快速判断字符串是否为纯数字（Socket.io 协议解析常用技巧）
      if (buf != Number(buf) || str.charAt(i) !== "-") {
        throw new Error("Illegal attachments");
      }
      const n = Number(buf);
      if (!isInteger(n) || n < 0) {
        throw new Error("Illegal attachments");
      } else if (n > (this.opts?.maxAttachments ?? 10)) {
        throw new Error("too many attachments");
      }
      p.attachments = n;
    }

    // look up namespace (if any)
    if ("/" === str.charAt(i + 1)) {
      const start = i + 1;
      while (++i) {
        const c = str.charAt(i);
        if ("," === c) break;
        if (i === str.length) break;
      }
      p.nsp = str.substring(start, i);
    } else {
      p.nsp = "/";
    }

    // look up id
    const next = str.charAt(i + 1);
    // @ts-expect-error - 检查下一个字符是否为数字，用于提取消息 ID
    if ("" !== next && Number(next) == next) {
      const start = i + 1;
      while (++i) {
        const c = str.charAt(i);
        // @ts-expect-error - 循环读取所有数字字符
        if (null == c || Number(c) != c) {
          --i;
          break;
        }
        if (i === str.length) break;
      }
      p.id = Number(str.substring(start, i + 1));
    }

    // look up json data
    if (str.charAt(++i)) {
      const payload = this.tryParse(str.substr(i));
      if (isPayloadValid(p.type, payload)) {
        p.data = payload;
      } else {
        throw new Error("invalid payload");
      }
    }

    // debug("decoded %s as %j", str, p);
    return p;
  }


  private tryParse(str: string) {
    try {
      return JSON.parse(str, this.opts?.reviver);
    } catch (e) {
      return false;
    }
  }
/**
   * Deallocates a parser's resources
   */
  public destroy() {
    if (this.reconstructor) {
      this.reconstructor.finishedReconstruction();
      this.reconstructor = null;
    }
  }
}

const isPayloadValid = (type: PacketType, payload: any): boolean => {
  switch (type) {
    case PacketType.CONNECT:
      return isObject(payload);
    case PacketType.DISCONNECT:
      return payload === undefined;
    case PacketType.CONNECT_ERROR:
      return typeof payload === "string" || isObject(payload);
    case PacketType.EVENT:
    case PacketType.BINARY_EVENT:
      return (
        Array.isArray(payload) &&
        (typeof payload[0] === "number" ||
          (typeof payload[0] === "string" &&
            RESERVED_EVENTS.indexOf(payload[0]) === -1))
      );
    case PacketType.ACK:
    case PacketType.BINARY_ACK:
      return Array.isArray(payload);
  }
}
// see https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
function isObject(value: any): boolean {
  return Object.prototype.toString.call(value) === "[object Object]";
}
