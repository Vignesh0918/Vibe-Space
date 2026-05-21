const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  postId: {
    type: String, // Or mongoose.Schema.Types.ObjectId if referencing Mongoose Post
    required: true,
    index: true,
  },
  userId: {
    type: String, // Commenter UID
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
  text: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Comment', CommentSchema);
