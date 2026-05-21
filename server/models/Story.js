const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  userName: {
    type: String,
    required: true,
  },
  userAvatar: {
    type: String,
    default: '',
  },
  mediaUrl: {
    type: String,
    required: true,
  },
  circleId: {
    type: String,
    required: true,
    index: true,
  },
  viewers: {
    type: [String], // Array of viewer UIDs
    default: [],
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    index: { expires: 0 }, // Automatically delete when expired
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Story', StorySchema);
