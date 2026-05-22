const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Circle = require('../models/Circle');
const Post = require('../models/Post');
const Vibe = require('../models/Vibe');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const updateMoodSchema = z.object({
  body: z.object({
    mood: z.string().min(1)
  })
});

const followSchema = z.object({
  body: z.object({
    targetUserId: z.string().min(1)
  }).optional()
});

const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, {
      message: "Username must be 3-20 characters, alphanumeric or underscores only."
    }),
    displayName: z.string().optional().nullable(),
    photoURL: z.string().optional().nullable(),
    bio: z.string().optional().nullable(),
    mood: z.string().optional().nullable(),
  })
});

const onlineStatusSchema = z.object({
  body: z.object({
    isOnline: z.boolean(),
  })
});

const locationSchema = z.object({
  body: z.object({
    latitude: z.number(),
    longitude: z.number(),
  })
});

// Check if username is available
router.get('/check-username/:username', async (req, res) => {
  try {
    const username = req.params.username.trim().toLowerCase();
    const usernameRegex = /^[a-z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.json({ 
        success: false, 
        error: 'Username must be 3-20 characters, lowercase alphanumeric or underscores only.' 
      });
    }

    const existingUser = await User.findOne({ username });
    return res.json({ success: true, available: !existingUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create user profile
router.post('/', authMiddleware, validate(createUserSchema), async (req, res) => {
  try {
    const { username, displayName, photoURL, bio, mood } = req.body;
    const userId = req.user.uid;
    const cleanUsername = username.trim().toLowerCase();
    
    // Check if user already exists
    let existingUser = await User.findOne({ uid: userId });
    if (existingUser) {
      return res.json({ success: true, data: existingUser });
    }

    // Check if username is taken
    const usernameTaken = await User.findOne({ username: cleanUsername });
    if (usernameTaken) {
      return res.status(400).json({ success: false, error: 'Username is already taken' });
    }

    const newUser = new User({
      uid: userId,
      username: cleanUsername,
      displayName,
      photoURL,
      bio,
      mood,
      isOnline: true,
      lastSeen: new Date(),
    });

    await newUser.save();

    // Create default circles for the user
    const defaultCircles = [
      { name: 'Friends', type: 'Friends', ownerId: userId, members: [userId] },
      { name: 'Family', type: 'Family', ownerId: userId, members: [userId] },
      { name: 'Work', type: 'Work', ownerId: userId, members: [userId] },
      { name: 'Secret', type: 'Secret', ownerId: userId, members: [userId] }
    ];

    await Circle.insertMany(defaultCircles);

    return res.status(201).json({ success: true, data: newUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Search users by username/displayName
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json({ success: true, data: [] });
    }
    const queryRegex = new RegExp(q, 'i');
    const users = await User.find({
      $and: [
        {
          $or: [
            { username: queryRegex },
            { displayName: queryRegex }
          ]
        },
        { isDeactivated: { $ne: true } }
      ]
    }).limit(20);
    return res.json({ success: true, data: users });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Recommended users
router.get('/recommended', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.uid;
    const currentUser = await User.findOne({ uid: currentUserId });
    const following = currentUser ? currentUser.following : [];

    // Find all circles the current user is in
    const circles = await Circle.find({ members: currentUserId });
    const circleMemberIds = circles.reduce((acc, circle) => {
      circle.members.forEach(m => {
        if (m !== currentUserId && !following.includes(m)) {
          acc.add(m);
        }
      });
      return acc;
    }, new Set());

    const recommendedIds = Array.from(circleMemberIds);

    let recommendedUsers = await User.find({
      uid: { $in: recommendedIds },
      isDeactivated: { $ne: true }
    });

    if (recommendedUsers.length === 0) {
      recommendedUsers = await User.find({
        uid: { $nin: [...following, currentUserId] },
        isDeactivated: { $ne: true }
      }).limit(10);
    }

    return res.json({ success: true, data: recommendedUsers });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user profile
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.params.userId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    return res.json({ success: true, data: user });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update user profile
router.put('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.uid !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { uid: userId },
      { $set: req.body },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update online status
router.post('/:userId/online', authMiddleware, validate(onlineStatusSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const { isOnline } = req.body;

    const updatedUser = await User.findOneAndUpdate(
      { uid: userId },
      { 
        $set: { 
          isOnline,
          lastSeen: new Date()
        } 
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update user location
router.post('/location', authMiddleware, validate(locationSchema), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userId = req.user.uid;

    const updatedUser = await User.findOneAndUpdate(
      { uid: userId },
      {
        $set: {
          location: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)] // longitude first in GeoJSON
          }
        }
      },
      { new: true }
    );

    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Query nearby users
router.get('/nearby/search', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 10000 } = req.query; // default 10km
    
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Latitude and longitude are required' });
    }

    const users = await User.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      },
      uid: { $ne: req.user.uid } // Exclude self
    });

    return res.json({ success: true, data: users });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user posts alias
router.get('/:userId/posts', authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: posts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update mood status only
router.put('/:userId/mood', authMiddleware, validate(updateMoodSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.uid !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { mood } = req.body;
    const updatedUser = await User.findOneAndUpdate(
      { uid: userId },
      { $set: { mood } },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user stats
router.get('/:userId/stats', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const postsCount = await Post.countDocuments({ userId });
    const circlesCount = await Circle.countDocuments({ members: userId });
    const vibesCount = await Vibe.countDocuments({ userId });
    return res.json({
      success: true,
      data: { postsCount, circlesCount, vibesCount }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Soft delete account
router.delete('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.uid !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const updatedUser = await User.findOneAndUpdate(
      { uid: userId },
      { $set: { isDeactivated: true } },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    return res.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Follow a user
router.post('/:userId/follow', authMiddleware, validate(followSchema), async (req, res) => {
  try {
    const targetUserId = req.params.userId || req.body.targetUserId;
    const currentUserId = req.user.uid;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ success: false, error: 'You cannot follow yourself' });
    }

    const user = await User.findOneAndUpdate(
      { uid: currentUserId },
      { $addToSet: { following: targetUserId } },
      { new: true }
    );

    const target = await User.findOneAndUpdate(
      { uid: targetUserId },
      { $addToSet: { followers: currentUserId } },
      { new: true }
    );

    if (!target) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    return res.json({ success: true, data: { user, target } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Unfollow a user
router.delete('/:userId/follow', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.uid;

    await User.findOneAndUpdate(
      { uid: currentUserId },
      { $pull: { following: targetUserId } }
    );

    await User.findOneAndUpdate(
      { uid: targetUserId },
      { $pull: { followers: currentUserId } }
    );

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get followers
router.get('/:userId/followers', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.params.userId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const followers = await User.find({ uid: { $in: user.followers || [] } });
    return res.json({ success: true, data: followers });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get following
router.get('/:userId/following', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.params.userId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const following = await User.find({ uid: { $in: user.following || [] } });
    return res.json({ success: true, data: following });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
