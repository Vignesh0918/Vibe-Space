const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: {
    type: String, // Recipient User UID
    required: true,
    index: true,
  },
  type: {
    type: String, // 'like', 'comment', 'message', 'circle_invite', etc.
    required: true,
  },
  senderId: {
    type: String, // Action sender UID
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  senderAvatar: {
    type: String,
    default: '',
  },
  postId: {
    type: String, // Post associated (if any)
    default: '',
  },
  postImage: {
    type: String, // Post thumbnail (if any)
    default: '',
  },
  text: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Notification', NotificationSchema);
