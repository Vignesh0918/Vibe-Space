const mongoose = require('mongoose');

const VibeSchema = new mongoose.Schema({
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
  mood: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    default: '',
  },
  songTitle: {
    type: String,
    default: '',
  },
  songArtist: {
    type: String,
    default: '',
  },
  circleIds: {
    type: [String],
    default: [],
  },
  reactions: {
    type: Map,
    of: [String],
    default: {},
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h TTL like stories
    index: { expires: 0 },
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Vibe', VibeSchema);
