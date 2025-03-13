// services/websocket.js
const WebSocket = require('ws');

const ws = new WebSocket(process.env.REACT_APP_WS_URL);

export const subscribeToUpdates = (callback) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    callback(data);
  });
};

export const sendMessage = (data) => ws.send(JSON.stringify(data));
