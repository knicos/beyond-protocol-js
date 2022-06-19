import ee, {Emitter} from 'event-emitter';
import allOff from 'event-emitter/all-off';
import {Peer} from './Peer';
import msgpack from 'msgpack5';
import { Channel } from './channel';
import { DataPacket, StreamPacket, getData, DataType } from './packets';
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
	peer: Peer;
    uri: string;
    paused = false;
    active = true;
    availableChannels = new Set<Channel>();
    availableFrames = new Set<number>();
    enabledChannels = new Map<string, IVideoState>();
    found = false;
    lastTimestamp = 0;
    startTimestamp = 0;
    data = new Map<Channel, any>();
    fsdata = new Map<Channel, any>();
    interval: NodeJS.Timer;
    frame = 0;
    frameset = 0;

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

        const [timestamp, fs, frame, channel] = streampckg;

        const frameID = (fs << 8) | frame;
        this.availableFrames.add(frameID);

        if (fs !== this.frameset) return;

        if (frame === 255) {
            if (channel >= 64 && getData(pckg).length > 0) {
              this._decodeFramesetData(channel, getData(pckg));
              this.emit('fsdata', channel);
            }
        }

        if (frame !== this.frame) return;

        let rts: number;
        if (channel === 0) {
          rts = Date.now();
        }

        this.emit('raw', streampckg, pckg);

        if (this.startTimestamp === 0) {
            this.startTimestamp = timestamp;
        }

        if (timestamp !== this.lastTimestamp) {
            this.emit('frameEnd', this.lastTimestamp);
            this.lastTimestamp = timestamp;
            this.emit('frameStart', this.lastTimestamp);
        }

        if (channel >= 32) {
            if (channel >= 64 && getData(pckg).length > 0) {
                this._decodeData(channel, getData(pckg));
            }
            this.emit('packet', streampckg, pckg);
        } else {
            this.availableChannels.add(channel);
            const id = `id-${fs}-${frame}-${channel}`;

            if (this.enabledChannels.has(id)) {
                this.emit('packet', streampckg, pckg);
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
      this.peer = null;
    }

    start() {
      if (!this.peer) {
        return;
      }
      this.active = true;

      this.interval = setInterval(() => {
        if (this.active && this.found) {
            this.enabledChannels.forEach((value, key) => {
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
      this.enabledChannels.forEach((value, key) => {
        this.post([1,value.stream,255,value.channel,5],[255,7,35,255,0,Buffer.alloc(0)]);
      });
    }

    post(spkt: StreamPacket, pkt: DataPacket) {
        this.peer.send(this.uri, 0, spkt, pkt);
    }

    enableFrame(stream: number, frame: number) {
        if (this.frame !== frame || this.frameset !== stream) {
            this.enabledChannels.clear();
            this.data.clear();
            this.availableChannels.clear();
        }
        this.frame = frame;
        this.frameset = stream;
    }

    enableVideo(stream: number, frame: number, channel: Channel) {
        this.enableFrame(stream, frame);
        const id = `id-${stream}-${frame}-${channel}`;
        this.enabledChannels.set(id, { rxcount: 0, stream, frame, channel });
    }

    disableVideo(stream: number, frame: number, channel: number) {
        const id = `id-${stream}-${frame}-${channel}`;
        this.enabledChannels.delete(id);
    }

    set(channel: Channel, value: unknown) {
        this.post([1, this.frameset , this.frame, channel, 0],[103,7,1,0,0, encode(value) as unknown as Buffer]);
    }

    getWidth(): number {
         return this.data.has(65) ? this.data.get(65)[0][4] : 0;
    }

    getHeight(): number {
        return this.data.has(65) ? this.data.get(65)[0][5] : 0;
   }
}

ee(FTLStream.prototype);

