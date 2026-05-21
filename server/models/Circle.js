const mongoose = require('mongoose');

const CircleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['Friends', 'Family', 'Work', 'Secret', 'Custom'],
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  ownerId: {
    type: String, // UID of user
    required: true,
    index: true,
  },
  members: {
    type: [String], // Array of UIDs
    default: [],
  },
  postsCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Circle', CircleSchema);
