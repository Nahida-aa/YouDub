import { deconstructPacket } from "./binary.ts";
import { hasBinary } from "./is-binary.ts";
import { Packet, PacketType } from "./types.ts";

export const ioEncode = (obj: Packet) => {
  // debug("encoding packet %j", obj);

  if (obj.type === PacketType.EVENT || obj.type === PacketType.ACK) {
    if (hasBinary(obj)) {
      return encodeAsBinary({
        type:
          obj.type === PacketType.EVENT
            ? PacketType.BINARY_EVENT
            : PacketType.BINARY_ACK,
        nsp: obj.nsp,
        data: obj.data,
        id: obj.id,
      });
    }
  }
  return [encodeAsString(obj)] 
}

const encodeAsString = (obj: Packet, replacer?: (this: any, key: string, value: any) => any): string => {
    // first is type
    let str = "" + obj.type;

    // attachments if we have them
    if (
      obj.type === PacketType.BINARY_EVENT ||
      obj.type === PacketType.BINARY_ACK
    ) {
      str += obj.attachments + "-";
    }

    // if we have a namespace other than `/`
    // we append it followed by a comma `,`
    if (obj.nsp && "/" !== obj.nsp) {
      str += obj.nsp + ",";
    }

    // immediately followed by the id
    if (null != obj.id) {
      str += obj.id;
    }

    // json data
    if (null != obj.data) {
      str += JSON.stringify(obj.data, replacer);
    }

    // debug("encoded %j as %s", obj, str);
    return str;
  }
const encodeAsBinary = (obj: Packet) => {
    const deconstruction = deconstructPacket(obj);
    const pack = encodeAsString(deconstruction.packet);
    const buffers = deconstruction.buffers;

    buffers.unshift(pack); // add packet info to beginning of data list
    return buffers; // write all the buffers
  }