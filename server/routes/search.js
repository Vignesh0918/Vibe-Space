const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Circle = require('../models/Circle');
const Post = require('../models/Post');
const Vibe = require('../models/Vibe');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { q, type = 'all', page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitCount = parseInt(limit);

    if (!q) {
      return res.json({
        success: true,
        data: { users: [], circles: [], posts: [], vibes: [] }
      });
    }

    const queryRegex = new RegExp(q, 'i');
    const results = {
      users: [],
      circles: [],
      posts: [],
      vibes: []
    };

    if (type === 'all' || type === 'users') {
      results.users = await User.find({
        $and: [
          {
            $or: [
              { username: queryRegex },
              { displayName: queryRegex }
            ]
          },
          { isDeactivated: { $ne: true } }
        ]
      })
      .skip(skip)
      .limit(limitCount);
    }

    if (type === 'all' || type === 'circles') {
      results.circles = await Circle.find({
        name: queryRegex,
        isPublic: true
      })
      .skip(skip)
      .limit(limitCount);
    }

    if (type === 'all' || type === 'posts') {
      results.posts = await Post.find({
        caption: queryRegex
      })
      .skip(skip)
      .limit(limitCount);
    }

    if (type === 'all' || type === 'vibes') {
      const now = new Date();
      results.vibes = await Vibe.find({
        text: queryRegex,
        expiresAt: { $gt: now }
      })
      .skip(skip)
      .limit(limitCount);
    }

    return res.json({
      success: true,
      data: results
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
