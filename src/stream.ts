import ee, {Emitter} from 'event-emitter';
import allOff from 'event-emitter/all-off';
import {Peer} from './Peer';
import msgpack from 'msgpack5';
import { Channel, ChannelName, toChannel } from './channel';
import { DataPacket, StreamPacket, getData, DataType, getCodec, getFrameCount } from './packets';
const {encode, decode} = msgpack();

interface IVideoState {
    rxcount: number;
    stream: number;
    frame: number;
    channel: Channel;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FTLStream extends Emitter {};

export class FTLStream {
	readonly peer: Peer;
    readonly uri: string;
    paused = false;
    active = true;
    private _availableChannels = new Set<Channel>();
    private _availableFrames = new Set<[number, number]>();
    private _enabledChannels = new Map<Channel, IVideoState>();
    private found = false;
    private lastTimestamp = 0;
    private startTimestamp = 0;
    private data = new Map<Channel, any>();
    private fsdata = new Map<Channel, any>();
    private interval: NodeJS.Timer;
    private frame = 0;
    private frameset = 0;
    private statsCount = 0;
    private latencySum = 0;
    private latency = 0;
    private fps = 0;
    private statsTime = Date.now();

	constructor(peer: Peer, uri: string) {
        this.peer = peer;
        this.uri = uri;

        this.peer.bind(uri, (latency: number, streampckg: StreamPacket, pckg: DataPacket) => {
            if (this.paused || !this.active) {
                return;
            }

            this.emit('raw', streampckg, pckg);

            const [timestamp, fs, frame, channel, flags] = streampckg;

            this._availableFrames.add([fs, frame]);

            if (flags & 0x1) {
                this.emit('request', fs, frame, channel);
                return;
            }

            if (fs !== this.frameset) return;

            if (frame === 255) {
                if (channel >= 64 && getData(pckg).length > 0) {
                this._decodeFramesetData(channel, getData(pckg));
                this.emit('fsdata', channel, this.fsdata.get(channel));
                }
            }

            if (frame !== this.frame) return;

            let rts: number;
            if (channel === 0) {
            rts = Date.now();
            }

            if (this.startTimestamp === 0) {
                this.startTimestamp = timestamp;
            }

            if (timestamp !== this.lastTimestamp) {
                this.emit('frameEnd', this.lastTimestamp);
                this.lastTimestamp = timestamp;
                this.emit('frameStart', this.lastTimestamp);
            }

            if (channel >= 32) {
                this.emit('packet', streampckg, pckg);
                if (channel >= 64 && getData(pckg).length > 0) {
                    this._decodeData(channel, getData(pckg));
                    this.emit('data', channel, this.data.get(channel));
                }
            } else {
                this._availableChannels.add(channel);

                if (this._enabledChannels.has(channel)) {
                    this.emit('packet', streampckg, pckg);
                    this.emit('video', timestamp, getCodec(pckg), getFrameCount(pckg), getData(pckg));
                }
            }

            if (channel === 2048) {
            const procLatency = Date.now() - rts;
            this.latencySum += latency + this.peer.latency + procLatency;
            ++this.statsCount;
            }
        });

        this.on('started', () => {
        if (this.found) {
            this.emit('ready');
        }
        });

        const disconCB = () => {
        this.found = false;
        this.stop();
        };
        this.peer.on('disconnect', disconCB);

        this.on('stop', () => {
        this.peer.off('disconnect', disconCB);
        })
	}

    getStatistics() {
        if (this.statsCount >= 20) {
        this.latency = this.latencySum / this.statsCount;
        const now = Date.now();
        const seconds = (now - this.statsTime) / 1000;
        this.fps = this.statsCount / seconds;
        this.statsTime = now;
        this.latencySum = 0;
        this.statsCount = 0;
        };
        return {
        latency: this.latency,
        fps: this.fps,
        };
    }

    private _decodeData(channel: Channel, rawData: DataType) {
      try {
        const data = decode(rawData);
        this.data.set(channel, data);
        if (channel === 69) {
            this.emit(data[0]);
        }
      } catch(err) {
          console.error('Decode error', err, rawData);
      }
    }

    private _decodeFramesetData(channel: Channel, rawData: DataType) {
      try {
        const data = decode(rawData);
        this.fsdata.set(channel, data);
      } catch(err) {
          console.error('Decode error', err, rawData);
      }
    }

    stop() {
      this.active = false;
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      if (this.found) {
        this.peer.rpc("disable_stream", () => {
            // Deliberate
        });
        this.peer.unbind(this.uri);
        this.found = false;
      }
      this.emit('stop');
    }

    destroy() {
      this.stop();
      allOff(this);
    }

    start() {
      if (!this.peer) {
        return;
      }
      this.active = true;

      this.interval = setInterval(() => {
        if (this.active && this.found) {
            this._enabledChannels.forEach((value, key) => {
                this.post([1,value.stream,255,value.channel,1],[255,7,35,255,0,Buffer.alloc(0)]);
            });
        }
      }, 500);

      if (!this.found) {
        this.peer.rpc("enable_stream", res => {
            if (!res) {
                console.error('Stream not found', this.uri);
                if (this.active) {
                    setTimeout(() => this.start(), 500);
                }
                return;
            }
            console.log('Stream connected');
            this.found = true;
            this.emit('ready');
        }, this.uri, true);
      } else {
        this.emit('ready');
      }
    }

    keyframe() {
      this._enabledChannels.forEach((value, key) => {
        this.post([1,value.stream,255,value.channel,5],[255,7,35,255,0,Buffer.alloc(0)]);
      });
    }

    post(spkt: StreamPacket, pkt: DataPacket) {
        this.peer.send(this.uri, 0, spkt, pkt);
    }

    enableFrame(stream: number, frame: number) {
        if (this.frame !== frame || this.frameset !== stream) {
            this._enabledChannels.clear();
            this.data.clear();
            this._availableChannels.clear();
        }
        this.frame = frame;
        this.frameset = stream;
    }

    enableVideo(stream: number, frame: number, channel: Channel | ChannelName) {
        const c = toChannel(channel);
        this.enableFrame(stream, frame);
        this._enabledChannels.set(c, { rxcount: 0, stream, frame, channel: c });
    }

    disableVideo(stream: number, frame: number, channel: Channel) {
        this._enabledChannels.delete(channel);
    }

    activeFrame() {
        return [this.frameset, this.frame];
    }

    availableFrames() {
        return new Set(this._availableFrames);
    }

    availableChannels() {
        return new Set(this._availableChannels);
    }

    enabledVideo() {
        return new Set(this._enabledChannels.keys());
    }

    isEnabled(channel: Channel | ChannelName) {
        return this._enabledChannels.has(toChannel(channel));
    }

    set(channel: Channel | ChannelName, value: unknown) {
        this.post([1, this.frameset , this.frame, toChannel(channel), 0],[103,7,1,0,0, encode(value) as unknown as Buffer]);
    }

    get(channel: Channel | ChannelName) {
        return this.data.get(toChannel(channel));
    }

    getWidth(): number {
         return this.data.has(65) ? this.data.get(65)[0][4] : 0;
    }

    getHeight(): number {
        return this.data.has(65) ? this.data.get(65)[0][5] : 0;
   }
}

ee(FTLStream.prototype);

