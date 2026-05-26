export enum PacketType {
  CONNECT,
  DISCONNECT,
  EVENT,
  ACK,
  CONNECT_ERROR,
  BINARY_EVENT,
  BINARY_ACK,
}

export interface Packet {
  type: PacketType;
  nsp: string;
  data?: any;
  id?: number;
  attachments?: number;
}