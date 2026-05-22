const mongoose = require('mongoose');

const NearbyVibeSchema = new mongoose.Schema({
  creatorId: {
    type: String,
    required: true,
  },
  emoji: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  memberCount: {
    type: Number,
    default: 1,
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
    },
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // Automatically delete when expired
  },
  joinedBy: {
    type: [String], // UIDs who joined
    default: [],
  },
}, {
  timestamps: true,
});

// 2dsphere index on location
NearbyVibeSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('NearbyVibe', NearbyVibeSchema);
