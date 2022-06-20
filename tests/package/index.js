const beyond = require('@beyond/protocol');
const WebSocket = require('ws');

new beyond.Peer(new WebSocket('wss://app.ftlab.utu.fi/v1/socket'));

console.log('Created object');

process.exit(0);