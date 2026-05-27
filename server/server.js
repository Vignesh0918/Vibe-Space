require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import routers
const usersRoutes = require('./routes/users');
const circlesRoutes = require('./routes/circles');
const postsRoutes = require('./routes/posts');
const chatsRoutes = require('./routes/chats');
const storiesRoutes = require('./routes/stories');
const notificationsRoutes = require('./routes/notifications');
const uploadRoutes = require('./routes/upload');
const vibesRoutes = require('./routes/vibes');
const searchRoutes = require('./routes/search');
const aiRoutes = require('./routes/ai');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const { initWebSocketServer } = require('./config/websocket');
initWebSocketServer(server);

// Import Agenda background scheduler
const { startAgenda, stopAgenda } = require('./config/agenda');

// Ensure public uploads directory exists on server initialization
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl || req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Routes Setup
app.use('/api/users', usersRoutes);
app.use('/api/circles', circlesRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/vibes', vibesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint - updated to trigger env reload
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Port and MongoDB setup
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('CRITICAL: MONGO_URI environment variable is missing.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connected Successfully.');
    
    // Start Agenda background scheduler
    await startAgenda();

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database connection error:', error.message);
  });

// Graceful shutdown handlers
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
  await stopAgenda();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
