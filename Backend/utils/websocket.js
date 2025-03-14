wss.clients.forEach(client => client.send(JSON.stringify({ type: 'resourceUpdate', data: { cpu, memoryUsed, diskUsed } })));
