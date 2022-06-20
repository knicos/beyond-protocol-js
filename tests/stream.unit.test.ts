import { Channel } from '../src/channel';
import { DataPacket, StreamPacket } from '../src/packets';
import { Peer, RPCMethod } from '../src/Peer';
import { FTLStream } from '../src/stream';
import msgpack from 'msgpack5';
import { Codec } from '../src/codecs';
const {encode, decode} = msgpack();

jest.mock('../src/Peer');

const MockedPeer = jest.mocked(Peer);

describe("Stream Class", () => {
    let mockPeer: Peer;
    let cb: RPCMethod = () => {
        // Deliberate
    };

    beforeEach(() => {
        mockPeer = new Peer();
        const mockedInstance = MockedPeer.mock.instances[0];
        const mockedBind = mockedInstance.bind as jest.Mock;

        mockedBind.mockImplementation((name: string, f: RPCMethod) => {
            cb = f;
        });
    });

    afterEach(() => {
        MockedPeer.mockReset();
    });

    it("can send packets to peer", () => {
        const stream = new FTLStream(mockPeer, "ftl://ftlab.utu.fi/test");

        const spkt: StreamPacket = [1, 0, 0, 0, 0];
        const pkt: DataPacket = [0, 0, 1, 255, 0, Buffer.alloc(0)];
        stream.post(spkt, pkt);

        expect(mockPeer.send).toHaveBeenCalledWith("ftl://ftlab.utu.fi/test", 0, spkt, pkt);
    });

    it("can receive request packets from peer", () => {
        const stream = new FTLStream(mockPeer, "ftl://ftlab.utu.fi/test");

        const spkt: StreamPacket = [1, 0, 0, 0, 1];
        const pkt: DataPacket = [0, 0, 1, 255, 0, Buffer.alloc(0)];
        
        stream.on('request', (fs: number, frame: number, channel: Channel) => {
            expect(fs).toBe(0);
            expect(frame).toBe(0);
            expect(channel).toBe(0);
        });

        cb(0, spkt, pkt);
        expect.assertions(3);
    });

    it("does not receive data from other frames", () => {
        const stream = new FTLStream(mockPeer, "ftl://ftlab.utu.fi/test");

        const spkt: StreamPacket = [1, 0, 1, 64, 0];
        const pkt: DataPacket = [0, 0, 1, 255, 0, encode(["some source"]) as unknown as Buffer];
        
        stream.on('data', (channel: Channel) => {
            expect(channel).toBe(64);
        });

        cb(0, spkt, pkt);
        expect.assertions(0);
    });

    it("does receive data from selected frame", () => {
        const stream = new FTLStream(mockPeer, "ftl://ftlab.utu.fi/test");

        const spkt: StreamPacket = [1, 0, 1, 64, 0];
        const pkt: DataPacket = [0, 0, 1, 255, 0, encode(["some source"]) as unknown as Buffer];
        
        stream.on('data', (channel: Channel, data: string[]) => {
            expect(channel).toBe(64);
            expect(data).toHaveLength(1);
            expect(data[0]).toBe("some source");
        });

        stream.enableFrame(0, 1);

        cb(0, spkt, pkt);
        expect.assertions(3);
    });

    it("does receive video from selected frame", () => {
        const stream = new FTLStream(mockPeer, "ftl://ftlab.utu.fi/test");

        const spkt: StreamPacket = [100, 0, 1, 0, 0];
        const pkt: DataPacket = [0, 0, 1, 255, 0, encode("some video") as unknown as Buffer];
        
        stream.on('video', (timestamp: number, codec: Codec, count: number, data: Buffer) => {
            expect(timestamp).toBe(100);
            expect(codec).toBe(0);
            expect(count).toBe(1);
            expect(decode(data)).toBe("some video");
        });

        stream.enableVideo(0, 1, 0);

        cb(0, spkt, pkt);
        expect.assertions(4);
    });
});
