require('dotenv').config();
const express = require('express');
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

const app = express();

// Ensure public uploads directory exists on server initialization
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

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

// Health check endpoint
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
  .then(() => {
    console.log('MongoDB Connected Successfully.');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database connection error:', error.message);
  });
