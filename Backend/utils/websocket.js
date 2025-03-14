// backend/utils/websocket.js
const WebSocket = require('ws');
const ResourceUsage = require('../models/ResourceUsage');

let wss;

function initializeWebSocket(server) {
  wss = new WebSocket.Server({ server });
  console.log('WebSocket server initialized');

  wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    ws.on('close', () => console.log('WebSocket client disconnected'));
  });
}

async function broadcastResourceUpdate(cpu, memoryUsed, diskUsed) {
  if (!wss) {
    console.error('WebSocket server not initialized');
    return;
  }

  // Save to MongoDB
  await ResourceUsage.create({ cpu, memoryUsed, diskUsed });

  // Broadcast to clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ 
        type: 'resourceUpdate', 
        data: { cpu, memoryUsed, diskUsed } 
      }));
    }
  });
}

module.exports = { initializeWebSocket, broadcastResourceUpdate };
