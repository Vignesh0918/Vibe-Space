const express = require('express');
const router = express.Router();
const Vibe = require('../models/Vibe');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const createVibeSchema = z.object({
  body: z.object({
    mood: z.string().min(1),
    text: z.string().optional().nullable(),
    songTitle: z.string().optional().nullable(),
    songArtist: z.string().optional().nullable(),
    circleIds: z.array(z.string()).min(1),
  })
});

// Create vibe
router.post('/', authMiddleware, validate(createVibeSchema), async (req, res) => {
  try {
    const { mood, text, songTitle, songArtist, circleIds } = req.body;
    const userId = req.user.uid;

    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h expiration

    const newVibe = new Vibe({
      userId,
      userName: user.displayName || user.username,
      userAvatar: user.photoURL || '',
      mood,
      text: text || '',
      songTitle: songTitle || '',
      songArtist: songArtist || '',
      circleIds,
      reactions: {},
      expiresAt,
    });

    await newVibe.save();

    // Increment user vibesCount
    await User.findOneAndUpdate({ uid: userId }, { $inc: { vibesCount: 1 } });

    return res.status(201).json({ success: true, data: newVibe });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get vibes feed for user's circles
router.get('/feed/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const now = new Date();

    // Find all circles this user is a member of
    const Circle = require('../models/Circle');
    const userCircles = await Circle.find({ members: userId });
    const circleIds = userCircles.map(c => c._id.toString());

    // Query active vibes that belong to these circles
    const vibes = await Vibe.find({
      circleIds: { $in: circleIds },
      expiresAt: { $gt: now }
    }).sort({ createdAt: -1 });

    return res.json({ success: true, data: vibes });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete own vibe
router.delete('/:vibeId', authMiddleware, async (req, res) => {
  try {
    const { vibeId } = req.params;
    const userId = req.user.uid;

    const vibe = await Vibe.findById(vibeId);
    if (!vibe) {
      return res.status(404).json({ success: false, error: 'Vibe not found' });
    }

    if (vibe.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await Vibe.findByIdAndDelete(vibeId);

    // Decrement user vibesCount
    await User.findOneAndUpdate({ uid: userId }, { $inc: { vibesCount: -1 } });

    return res.json({ success: true, message: 'Vibe deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle vibe emoji reaction
router.post('/:vibeId/react', authMiddleware, async (req, res) => {
  try {
    const { vibeId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.uid;

    if (!emoji) {
      return res.status(400).json({ success: false, error: 'Emoji is required' });
    }

    const vibe = await Vibe.findById(vibeId);
    if (!vibe) {
      return res.status(404).json({ success: false, error: 'Vibe not found' });
    }

    if (!vibe.reactions) {
      vibe.reactions = new Map();
    }

    const userList = vibe.reactions.get(emoji) || [];
    let updatedList;
    if (userList.includes(userId)) {
      updatedList = userList.filter(id => id !== userId);
    } else {
      updatedList = [...userList, userId];
    }

    if (updatedList.length === 0) {
      vibe.reactions.delete(emoji);
    } else {
      vibe.reactions.set(emoji, updatedList);
    }

    vibe.markModified('reactions');
    await vibe.save();

    return res.json({ success: true, data: Object.fromEntries(vibe.reactions) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get single vibe details
router.get('/:vibeId', authMiddleware, async (req, res) => {
  try {
    const { vibeId } = req.params;
    const vibe = await Vibe.findById(vibeId);
    if (!vibe) {
      return res.status(404).json({ success: false, error: 'Vibe not found' });
    }
    return res.json({ success: true, data: vibe });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
