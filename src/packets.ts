import { Channel } from './channel';
import { Codec } from './codecs';
import bl from 'bl';

export type StreamPacket = [number, number, number, Channel, number];

export function getTimestamp(pkt: StreamPacket) {
    return pkt[0];
}

export function getFrameset(pkt: StreamPacket) {
    return pkt[1];
}

export function getFrame(pkt: StreamPacket) {
    return pkt[2];
}

export function getChannel(pkt: StreamPacket) {
    return pkt[3];
}

export function getStreamFlags(pkt: StreamPacket) {
    return pkt[4];
}

export type DataType = Buffer;

export type DataPacket = [Codec, number, number, number, number, DataType];

export function getCodec(pkt: DataPacket) {
    return pkt[0];
}

export function getFrameCount(pkt: DataPacket) { 
    return pkt[2];
}

export function getBitrate(pkt: DataPacket) {
    return pkt[3];
}

export function getDataFlags(pkt: DataPacket) {
    return pkt[4];
}

export function getData(pkt: DataPacket) {
    return pkt[5];
}
