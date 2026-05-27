const WebSocket = require('ws');
const admin = require('firebase-admin');
const Chat = require('../models/Chat');

// Map of userId -> Set of WebSocket connections
const userConnections = new Map();

/**
 * Validates the auth token matching auth.js logic.
 */
const verifyToken = async (token) => {
  if (!token) return null;
  
  // If firebase-admin has any initialized apps
  if (admin.apps.length > 0) {
    // Dev fallback if token is just the UID
    if (token.length < 100) {
      return { uid: token };
    }
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      return { uid: decodedToken.uid };
    } catch (err) {
      console.warn('[WS Auth] Invalid token verification failed:', err.message);
      return null;
    }
  } else {
    // Signatureless dev fallback: treat token as UID directly
    return { uid: token };
  }
};

/**
 * Initializes the WebSocket server bound to the HTTP server instance.
 */
const initWebSocketServer = (httpServer) => {
  const wss = new WebSocket.Server({ server: httpServer });
  console.log('[WS] WebSocket Server initialized.');

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.userId = null;
    ws.chatId = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (messageData) => {
      try {
        const message = JSON.parse(messageData);

        switch (message.type) {
          case 'auth': {
            const { token } = message;
            const user = await verifyToken(token);
            if (user) {
              ws.userId = user.uid;
              
              // Register in userConnections map
              if (!userConnections.has(user.uid)) {
                userConnections.set(user.uid, new Set());
              }
              userConnections.get(user.uid).add(ws);

              ws.send(JSON.stringify({ type: 'authenticated', success: true }));
              console.log(`[WS] User ${user.uid} authenticated successfully.`);
            } else {
              ws.send(JSON.stringify({ type: 'authenticated', success: false, error: 'Invalid token' }));
              ws.close(4001, 'Unauthorized');
            }
            break;
          }

          case 'join': {
            if (!ws.userId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }
            const { chatId } = message;
            ws.chatId = chatId;
            ws.send(JSON.stringify({ type: 'joined', chatId }));
            console.log(`[WS] User ${ws.userId} joined room: ${chatId}`);
            break;
          }

          case 'leave': {
            const oldChatId = ws.chatId;
            ws.chatId = null;
            ws.send(JSON.stringify({ type: 'left', chatId: oldChatId }));
            console.log(`[WS] User ${ws.userId} left room: ${oldChatId}`);
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown action type' }));
        }
      } catch (err) {
        console.error('[WS] Error processing incoming client message:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid payload' }));
      }
    });

    ws.on('close', () => {
      if (ws.userId && userConnections.has(ws.userId)) {
        const conns = userConnections.get(ws.userId);
        conns.delete(ws);
        if (conns.size === 0) {
          userConnections.delete(ws.userId);
        }
      }
      console.log(`[WS] Connection closed for user: ${ws.userId || 'Guest'}`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Socket error for user ${ws.userId || 'Guest'}:`, err);
    });
  });

  // Keep connection alive: Ping clients every 30 seconds
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log(`[WS] Client inactive, terminating connection: ${ws.userId || 'Guest'}`);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
};

/**
 * Broadcasts events to all connected clients participating in a chat room.
 */
const sendToChatParticipants = async (chatId, senderId, payload) => {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      console.warn(`[WS] Chat room ${chatId} not found in database.`);
      return;
    }

    const jsonPayload = JSON.stringify(payload);

    chat.participants.forEach((userId) => {
      const conns = userConnections.get(userId);
      if (conns) {
        conns.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(jsonPayload);
          }
        });
      }
    });
  } catch (err) {
    console.error('[WS] Error broadcasting to chat participants:', err);
  }
};

module.exports = {
  initWebSocketServer,
  sendToChatParticipants,
  userConnections
};
