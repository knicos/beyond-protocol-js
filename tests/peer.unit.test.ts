import {Peer} from '../src/Peer';
import WebSocket from 'ws';

describe("Peer class", () => {
    let clientPeer: Peer;
    let serverPeer: Peer;
    let wss: WebSocket.Server;

    beforeEach(async () => {
        return new Promise((resolve) => {
            wss = new WebSocket.Server({ host: '127.0.0.1', port: 9003 });

            wss.on("connection", (ws) => {
                serverPeer = new Peer(ws, true);
            });

            const conn = new WebSocket('ws://127.0.0.1:9003');
            clientPeer = new Peer(conn);
            clientPeer.on('connect', () => {
                resolve(true);
            });
        });
    });

    afterEach(async () => {
        return new Promise((resolve) => {
            clientPeer.close();
            serverPeer.close();
            wss.close(() => {
                resolve(true);
            });
        });
    })

    it("can receive an RPC from the client", async () => {
        expect(clientPeer).toBeTruthy();
        expect(serverPeer).toBeTruthy();

        serverPeer.bind("test_rpc", (value) => {
            expect(value).toBe(5);
            return 10;
        });

        const r = await clientPeer.rpc("test_rpc", 5);
        expect(r).toBe(10);
        expect.assertions(4);
    });

    it("can receive an RPC from the server", async () => {
        expect(clientPeer).toBeTruthy();
        expect(serverPeer).toBeTruthy();

        clientPeer.bind("test_rpc", (value) => {
            expect(value).toBe(5);
            return 10;
        });

        const r = await serverPeer.rpc("test_rpc", 5);
        expect(r).toBe(10);
        expect.assertions(4);
    });

    it("can receive a notification from the server", async () => {
        expect(clientPeer).toBeTruthy();
        expect(serverPeer).toBeTruthy();

        await new Promise((resolve) => {
            clientPeer.bind("test_rpc", (value) => {
                expect(value).toBe(50);
                resolve(true);
            });
    
            serverPeer.send("test_rpc", 50);
        });

        expect.assertions(3);
    });

    it("can receive a notification from the client", async () => {
        expect(clientPeer).toBeTruthy();
        expect(serverPeer).toBeTruthy();

        await new Promise((resolve) => {
            serverPeer.bind("test_rpc", (value) => {
                expect(value).toBe(50);
                resolve(true);
            });
    
            clientPeer.send("test_rpc", 50);
        });

        expect.assertions(3);
    });
});