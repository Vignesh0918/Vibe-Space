const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const createStorySchema = z.object({
  body: z.object({
    userName: z.string().min(1),
    userAvatar: z.string().optional().nullable(),
    mediaUrl: z.string().url(),
    circleId: z.string().min(1),
  })
});

const viewStorySchema = z.object({
  body: z.object({
    userId: z.string().min(1),
  })
});

// Create a new story
router.post('/', authMiddleware, validate(createStorySchema), async (req, res) => {
  try {
    const { userName, userAvatar, mediaUrl, circleId } = req.body;
    const userId = req.user.uid;

    // Auto-expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);


    const newStory = new Story({
      userId,
      userName,
      userAvatar: userAvatar || '',
      mediaUrl,
      circleId,
      viewers: [],
      expiresAt,
    });

    await newStory.save();
    return res.status(201).json({ success: true, data: newStory });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch active stories for circles (grouped by poster)
router.get('/circles', authMiddleware, async (req, res) => {
  try {
    const { circleIds } = req.query;

    if (!circleIds) {
      return res.json({ success: true, data: [] });
    }

    const parsedCircleIds = Array.isArray(circleIds)
      ? circleIds
      : circleIds.split(',').filter(Boolean);

    if (parsedCircleIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const now = new Date();
    // Query active stories (mongo TTL also runs, but checking expiresAt explicitly is safest)
    const activeStories = await Story.find({
      circleId: { $in: parsedCircleIds },
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });

    // Group active stories by poster (userId)
    const groupedStories = {};
    activeStories.forEach((story) => {
      const { userId, userName, userAvatar } = story;
      if (!groupedStories[userId]) {
        groupedStories[userId] = {
          userId,
          userName,
          userAvatar,
          stories: [],
        };
      }
      groupedStories[userId].stories.push(story);
    });

    // Format grouped stories into array
    const results = Object.values(groupedStories);

    return res.json({ success: true, data: results });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Record that a user has viewed a story
router.post('/:storyId/view', authMiddleware, validate(viewStorySchema), async (req, res) => {
  try {
    const { storyId } = req.params;
    const { userId } = req.body;

    const updatedStory = await Story.findByIdAndUpdate(
      storyId,
      { $addToSet: { viewers: userId } },
      { new: true }
    );

    if (!updatedStory) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Admin utility to delete expired stories (usually handled by TTL, but keep for fallback)
router.delete('/expired', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const result = await Story.deleteMany({ expiresAt: { $lt: now } });
    return res.json({ success: true, count: result.deletedCount });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
