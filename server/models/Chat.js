const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  participants: {
    type: [String], // Array of participant user UIDs
    required: true,
    index: true,
  },
  isGroup: {
    type: Boolean,
    default: false,
  },
  name: {
    type: String,
    default: '',
  },
  creatorId: {
    type: String,
    default: '',
  },
  expiryHours: {
    type: Number,
    default: 0, // 0 means never expires
  },
  lastMessage: {
    text: { type: String, default: '' },
    senderId: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    readBy: { type: [String], default: [] },
  },
  unreadCounts: {
    type: Map,
    of: Number, // UID -> count of unread messages
    default: {},
  },
  groupAvatar: {
    type: String,
    default: '',
  },
  pinnedMessageId: {
    type: String,
    default: '',
  },
  adminIds: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Chat', ChatSchema);
