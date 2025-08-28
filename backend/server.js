const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server running on ws://localhost:${PORT}`);

const clients = new Map(); 
const rooms = new Map(); 

function broadcastToRoom(room, payload, exceptClientId = null) {
  for (const [clientId, meta] of clients.entries()) {
    if (meta.room === room && meta.ws.readyState === WebSocket.OPEN && clientId !== exceptClientId) {
      meta.ws.send(JSON.stringify(payload));
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, { ws, username: null, room: null, lastSeen: Date.now() });

  ws.send(JSON.stringify({ type: 'connected', clientId }));

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }

    const meta = clients.get(clientId);
    meta.lastSeen = Date.now();

    switch (data.type) {
      case 'join': {
        const username = String(data.username || 'Anon').slice(0, 32);
        const room = String(data.room || 'main').slice(0, 64);
        meta.username = username;
        meta.room = room;

        if (!rooms.has(room)) rooms.set(room, []);
        const history = rooms.get(room).slice(-200);
        ws.send(JSON.stringify({ type: 'history', room, history }));

        broadcastToRoom(room, { type: 'user-joined', clientId, username }, clientId);

        const userList = [];
        for (const [id, m] of clients.entries()) {
          if (m.room === room && m.username) userList.push({ clientId: id, username: m.username });
        }
        broadcastToRoom(room, { type: 'users', users: userList });
        break;
      }

      case 'message': {
        if (!meta.room || !meta.username) return;
        const message = {
          id: uuidv4(),
          clientId,
          username: meta.username,
          text: String(data.text || ''),
          ts: Date.now()
        };
        rooms.get(meta.room).push(message);
        broadcastToRoom(meta.room, { type: 'message', message });
        break;
      }

      case 'typing': {
        if (!meta.room || !meta.username) return;
        broadcastToRoom(meta.room, {
          type: 'typing',
          clientId,
          username: meta.username,
          isTyping: !!data.isTyping
        }, clientId);
        break;
      }

      case 'leave': {
        const room = meta.room;
        if (room) {
          broadcastToRoom(room, { type: 'user-left', clientId, username: meta.username }, clientId);
        }
        meta.room = null;
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    const meta = clients.get(clientId);
    if (meta) {
      const room = meta.room;
      const username = meta.username;
      clients.delete(clientId);
      if (room) {
        broadcastToRoom(room, { type: 'user-left', clientId, username });
        const userList = [];
        for (const [id, m] of clients.entries()) {
          if (m.room === room && m.username) userList.push({ clientId: id, username: m.username });
        }
        broadcastToRoom(room, { type: 'users', users: userList });
      }
    }
  });

  ws.on('error', () => {
    ws.close();
  });
});
