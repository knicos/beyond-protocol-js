import msgpack from 'msgpack5';
const {encode, decode} = msgpack();
import {v4 as uuidv4} from 'uuid';
import uuidParser from './utils/uuidParser';
import {connection, w3cwebsocket} from 'websocket';
import WebSocket from 'ws';
import ee, {Emitter} from 'event-emitter';

const kConnecting = 1;
const kConnected = 2;
const kDisconnected = 3;

type WebSocketConnection = WebSocket | connection | w3cwebsocket;

// Generate a unique id for this webservice
const uuid = uuidv4();
let my_uuid = uuidParser.parse(uuid)
my_uuid = new Uint8Array(my_uuid);
my_uuid = Buffer.from(my_uuid);

const kMagic = 0x0009340053640912;
const kVersion = 5;

function isw3c(ws: WebSocketConnection): ws is w3cwebsocket {
    return (ws as connection).on === undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Peer extends Emitter {}

export type RPCMethod = (...args: unknown[]) => unknown;

/**
 * Wrap a web socket with a MsgPack RCP protocol that works with our C++ version.
 * @param {websocket} ws Websocket object
 */
export class Peer {
    sock: WebSocketConnection;
    status = kConnecting;
    id: Buffer = null;
    string_id = "";
    bindings = {};
    proxies = {};
    events = {};
    callbacks = {};
    cbid = 0;

    latency = 0;

    uri = "unknown";
    name = "unknown";
    master = false;

    txBytes = 0;
    rxBytes = 0;
    lastStatsCall = Date.now();
    lastStats = null;

    static uuid: string;

    constructor(ws?: WebSocketConnection) {
        this.sock = ws;
        if (!ws) return;

        const message = (raw) => {
            //Gets right data for client
            if(isw3c(this.sock)){
                raw = raw.data;
            }

            this.rxBytes += raw.length || raw.byteLength;
            const msg = decode(raw);
            // console.log('MSG', msg)
            if (this.status === kConnecting) {
                if (msg[1] !== "__handshake__") {
                    console.log("Bad handshake", msg);
                    this.close();
                }
            }
            if (msg[0] === 0) {
                // console.log("MSG...", msg[2]);
                // Notification
                if (msg.length === 3) {
                    this._dispatchNotification(msg[1], msg[2]);
                // Call
                } else {
                    this._dispatchCall(msg[2], msg[1], msg[3]);
                }
            } else if (msg[0] === 1) {
                this._dispatchResponse(msg[1], msg[3]);
            }
        }
    
        const close = () => {
            this.emit("disconnect", this);
            this.status = kDisconnected;
        }
    
        const error = (e) => {
            console.error("Socket error: ", e);
            this.sock.close();
            this.status = kDisconnected;
        }
    
        //if undefined, peer is being used by client
        if(isw3c(this.sock)){
            this.sock.onmessage = message;
            this.sock.onclose = close;
            this.sock.onopen = () => {
                this.send("__handshake__", kMagic, kVersion, [my_uuid]);
            }
        //else peer is being used by server
        }else{
            this.sock.on("message", message);
            this.sock.on("close", close);
            this.sock.on("error", error);
        }
    
        this.bind("__handshake__", (magic: number, version: number, id: Buffer[]) => this._handshake(magic, version, id));
        this.send("__handshake__", kMagic, kVersion, [my_uuid]);
    }

    getStatistics() {
        const time = Date.now();
        if (time - this.lastStatsCall > 5000 || !this.lastStats) {
        this.lastStats = [time - this.lastStatsCall, this.rxBytes, 0];
        this.rxBytes = 0;
        this.txBytes = 0;
        this.lastStatsCall = time;
        }
        return this.lastStats;
    }

    private _handshake(magic: number, version: number, id: Buffer[]) {
        if (magic == kMagic) {
            console.log("Handshake received");
            this.status = kConnected;
            this.id = id[0];
            this.string_id = id[0].toString('hex');
            this.emit("connect", this);
        } else {
            console.log("Magic does not match");
            this.close();
        }
    }

    private _dispatchNotification(name: string, args: unknown[]) {
        if (name in this.bindings) {
            //console.log("Notification for: ", name);
            this.bindings[name](...args);
        } else {
            console.log("Missing handler for: ", name);
        }
    }

    private _dispatchCall(name: string, id: number, args: unknown[]) {
        // console.log("DISPATCHCALL", name, id, args)
        if (name in this.bindings) {
            //console.log("Call for:", name, id);
    
            try {
                const res = this.bindings[name].apply(this, args);
                if (res instanceof Promise) {
                    res.then(r => {
                        this.sock.send(encode([1,id,name,r]));
                    });
                } else {
                    this.sock.send(encode([1,id,name,res]));
                }
            } catch(e) {
                console.error("Could to dispatch or return call", e);
                this.close();
            }
        } else if (name in this.proxies) {
            //console.log("Proxy for:", name, id);
            args.unshift((res: unknown) => {
                try {
                    this.sock.send(encode([1,id,name,res]));
                } catch(e) {
                    console.log("ERROR")
                    this.close();
                }
            });
            this.proxies[name].apply(this, args);
        } else {
            console.log("Missing handler for: ", name);
        }
    }

    private _dispatchResponse(id: number, res: unknown) {
        if (id in this.callbacks) {
            this.callbacks[id].call(this, res);
            delete this.callbacks[id];
        } else {
            console.log("Missing callback");
        }
    }

    /**
     * Register an RPC handler that will be called from a remote machine. Remotely
     * passed arguments are provided to the given function as normal arguments, and
     * if the function returns a value, it will be returned over the network also.
     * 
     * @param {string} name The name of the function
     * @param {function} f A function or lambda to be callable remotely
     */
    bind(name: string, f: RPCMethod) {
        if (name in this.bindings) {
            //console.error("Duplicate bind to same procedure");
            this.bindings[name] = f;
        } else {
            this.bindings[name] = f;
        }
    }

    unbind(name: string) {
        if (name in this.bindings) {
        delete this.bindings[name];
        }
    }

    isBound(name: string) {
        return name in this.bindings || name in this.proxies;
    }

    /**
     * Allow an RPC call to pass through to another machine with minimal local
     * processing.
     */
    proxy(name: string, f: RPCMethod) {
        if (name in this.proxies) {
            //console.error("Duplicate proxy to same procedure");
            this.proxies[name] = f;
        } else {
            this.proxies[name] = f;
        }
    }

    /**
     * Call a procedure on a remote machine.
     * 
     * @param {string} name Name of the procedure
     * @param {function} cb Callback to receive return value as argument
     * @param {...} args Any number of arguments to also pass to remote procedure
     */
    rpc(name: string, cb: (r: unknown) => void, ...args: unknown[]) {
        const id = this.cbid++;
        this.callbacks[id] = cb;
    
        try {
            this.sock.send(encode([0, id, name, args]));
        } catch(e) {
            this.close();
        }
    }

    /**
     * Call a remote procedure but with no return value expected.
     * 
     * @param {string} name Name of the procedure
     * @param {...} args Any number of arguments to also pass to remote procedure
     */
    send(name: string, ...args: unknown[]) {
        try {
            this.sock.send(encode([0, name, args]));
        } catch(e) {
            this.close();
        }
    }

    sendB(name: string, args: unknown[]) {
        try {
            this.sock.send(encode([0, name, args]));
        } catch(e) {
            this.close();
        }
    }

    /**
     * Closes the socket
     */
    close() {
        if(!isw3c(this.sock)){
            this.sock.close();
        }
        this.status = kDisconnected;
    }

    getUuid(): string {
        return uuid;
    }
}		

ee(Peer.prototype);

Peer.uuid = my_uuid;
