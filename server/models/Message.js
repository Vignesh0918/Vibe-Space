const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  chatId: {
    type: String, // Chat reference (string ID)
    required: true,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    default: '',
  },
  mediaUrl: {
    type: String,
    default: '',
  },
  mediaType: {
    type: String, // 'image', 'voice', etc.
    default: '',
  },
  expiryHours: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    index: { expires: 0 }, // Automatically delete when this date is reached
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
  },
  readBy: {
    type: [String],
    default: [],
  },
  reactions: {
    type: Map,
    of: [String],
    default: {},
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Message', MessageSchema);
