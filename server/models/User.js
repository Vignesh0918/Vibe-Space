const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  photoURL: {
    type: String,
    default: '',
  },
  bio: {
    type: String,
    default: '',
  },
  mood: {
    type: String,
    default: 'Happy',
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  postsCount: {
    type: Number,
    default: 0,
  },
  vibesCount: {
    type: Number,
    default: 0,
  },
  circlesCount: {
    type: Number,
    default: 0,
  },
  followers: {
    type: [String],
    default: [],
  },
  following: {
    type: [String],
    default: [],
  },
  isDeactivated: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', UserSchema);
