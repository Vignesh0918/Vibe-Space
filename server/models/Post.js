const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  caption: {
    type: String,
    default: '',
  },
  imageURL: {
    type: String,
    required: true,
  },
  circleId: {
    type: String, // Circle ID or special value (e.g. 'all')
    required: true,
    index: true,
  },
  userId: {
    type: String, // Creator UID
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
  reactions: {
    type: Map,
    of: [String], // Map of emoji -> list of user UIDs
    default: {},
  },
  commentsCount: {
    type: Number,
    default: 0,
  },
  bookmarkedBy: {
    type: [String],
    default: [],
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Post', PostSchema);
