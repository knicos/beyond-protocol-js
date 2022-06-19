import { DataPacket, StreamPacket } from '../src/packets';
import { Peer } from '../src/Peer';
import { FTLStream } from '../src/stream';

jest.mock('../src/Peer');

describe("Stream Class", () => {
    let mockPeer: Peer;

    beforeEach(() => {
        mockPeer = new Peer();
    });

    it("can send packets to peer", () => {
        const stream = new FTLStream(mockPeer, "ftl://ftlab.utu.fi/test");

        const spkt: StreamPacket = [1, 0, 0, 0, 0];
        const pkt: DataPacket = [0, 0, 1, 255, 0, Buffer.alloc(0)];
        stream.post(spkt, pkt);

        expect(mockPeer.send).toHaveBeenCalledWith("ftl://ftlab.utu.fi/test", 0, spkt, pkt);
    });

    it("can reeeive packets from peer", () => {
        const stream = new FTLStream(mockPeer, "ftl://ftlab.utu.fi/test");

        const spkt: StreamPacket = [1, 0, 0, 0, 0];
        const pkt: DataPacket = [0, 0, 1, 255, 0, Buffer.alloc(0)];
        
        mockPeer.bindings["ftl://ftlab.utu.fi/test"](0, spkt, pkt);

        expect(mockPeer.send).toHaveBeenCalledWith("ftl://ftlab.utu.fi/test", 0, spkt, pkt);
    });
});
