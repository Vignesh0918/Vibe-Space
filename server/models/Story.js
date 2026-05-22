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
  viewers: [
    {
      userId: { type: String, required: true },
      viewedAt: { type: Date, default: Date.now }
    }
  ],
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    index: { expires: 0 }, // Automatically delete when expired
  },
}, {
  timestamps: true,
});

// Explicit schema-level TTL index to guarantee MongoDB creates it correctly
// (inline index: { expires: 0 } can be unreliable across MongoDB versions)
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware: guarantee expiresAt is always populated
StorySchema.pre('save', function(next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  next();
});

module.exports = mongoose.model('Story', StorySchema);
