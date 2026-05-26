import { Packet, PACKET_TYPES, PacketTypes, RawData } from "#/sokit/io/engine/commons.ts";

export const eioEncodePacket = (
  { type, data }: Packet,
  supportsBinary: boolean,
  callback: (encodedPacket: RawData) => void,
) => {
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return callback(
      supportsBinary ? data : "b" + toBuffer(data as BufferSource, true).toString("base64"),
    );
  }
  // plain string
  return callback(PACKET_TYPES[type as keyof PacketTypes] + (data || ""));
};
const toBuffer = (data: BufferSource, forceBufferConversion: boolean) => {
  if (
    Buffer.isBuffer(data) ||
    (data instanceof Uint8Array && !forceBufferConversion)
  ) {
    return data;
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  } else {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
};