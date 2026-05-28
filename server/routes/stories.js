const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const createStorySchema = z.object({
  body: z.object({
    userName: z.string().min(1),
    userAvatar: z.string().optional().nullable(),
    mediaUrl: z.string().url(),
    circleId: z.string().min(1),
    song: z.object({
      trackId: z.any().optional(),
      title: z.string().min(1),
      artist: z.string().min(1),
      artwork: z.string().optional().nullable(),
      previewUrl: z.string().optional().nullable(),
    }).optional().nullable(),
  })
});

const viewStorySchema = z.object({
  body: z.object({
    userId: z.string().min(1),
  })
});

// Safety net filter for active (non-expired) stories
const activeStoriesFilter = () => ({
  expiresAt: { $gt: new Date() }
});

// Create a new story
router.post('/', authMiddleware, validate(createStorySchema), async (req, res) => {
  try {
    const { userName, userAvatar, mediaUrl, circleId, song } = req.body;
    const userId = req.user.uid;

    // Verify user is a member of the circle
    const Circle = require('../models/Circle');
    const circle = await Circle.findById(circleId);
    if (!circle || !circle.members.includes(userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a member of this circle' });
    }

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
      song: song || undefined,
    });

    await newStory.save();
    return res.status(201).json({ success: true, data: newStory });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch active stories for followed users (grouped by poster)
router.get('/circles', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.uid;
    const currentUser = await User.findOne({ uid: currentUserId });
    const following = currentUser ? currentUser.following : [];

    // Include the user's own stories as well
    const targetUserIds = [...following, currentUserId];

    const now = new Date();
    // Query active stories
    const activeStories = await Story.find({
      userId: { $in: targetUserIds },
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
      groupedStories[userId].stories.push({
        ...story.toObject(),
        viewerCount: (story.viewers || []).length
      });
    });

    // Format grouped stories into array
    const results = Object.values(groupedStories);

    return res.json({ success: true, data: results });
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

// Get active stories by a user (MUST be before /:storyId to avoid route conflict)
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const now = new Date();

    let query = {
      userId,
      expiresAt: { $gt: now }
    };

    if (userId !== req.user.uid) {
      const Circle = require('../models/Circle');
      const userCircles = await Circle.find({ members: req.user.uid }).select('_id');
      const validCircleIds = userCircles.map(c => c._id.toString());
      query.circleId = { $in: validCircleIds };
    }

    const stories = await Story.find(query).sort({ createdAt: 1 });

    return res.json({ success: true, data: stories });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get story viewers with profile details (MUST be before GET /:storyId to avoid route conflict)
router.get('/:storyId/viewers', authMiddleware, async (req, res) => {
  try {
    const { storyId } = req.params;
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Only story owner can see viewers list
    if (story.userId !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const viewerIds = story.viewers.map(v => v.userId);
    const userProfiles = await User.find({ uid: { $in: viewerIds } });

    const viewersWithProfiles = story.viewers.map(viewer => {
      const profile = userProfiles.find(u => u.uid === viewer.userId);
      return {
        userId: viewer.userId,
        viewedAt: viewer.viewedAt,
        displayName: profile?.displayName || 'Unknown',
        username: profile?.username || '',
        photoURL: profile?.photoURL || '',
      };
    });

    // Sort by viewedAt descending (most recent viewer first)
    viewersWithProfiles.sort((a, b) =>
      new Date(b.viewedAt) - new Date(a.viewedAt)
    );

    return res.json({
      success: true,
      data: viewersWithProfiles,
      totalViews: viewersWithProfiles.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Record that a user has viewed a story
router.post('/:storyId/view', authMiddleware, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.uid;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Verify requester has access to the circle this story is in
    const Circle = require('../models/Circle');
    const circle = await Circle.findById(story.circleId);
    if (!circle || !circle.members.includes(userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not have access to this story' });
    }

    // Check if expired
    if (new Date() > new Date(story.expiresAt)) {
      return res.status(410).json({ success: false, error: 'Story has expired' });
    }

    // Don't count story owner viewing their own story
    if (story.userId === userId) {
      return res.json({ success: true, message: 'Owner view not counted' });
    }

    // Check if already viewed (avoid duplicates)
    const alreadyViewed = story.viewers.some(v => v.userId === userId);
    if (!alreadyViewed) {
      await Story.findByIdAndUpdate(storyId, {
        $push: { viewers: { userId, viewedAt: new Date() } }
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get single story details
router.get('/:storyId', authMiddleware, async (req, res) => {
  try {
    const { storyId } = req.params;
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    // Check if story is expired (TTL might not have cleaned it yet)
    if (new Date() > new Date(story.expiresAt)) {
      return res.status(404).json({ success: false, error: 'Story has expired' });
    }

    // Verify requester has access to the circle this story is in
    const Circle = require('../models/Circle');
    const circle = await Circle.findById(story.circleId);
    if (!circle || !circle.members.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not have access to this story' });
    }

    return res.json({ success: true, data: story });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete own story (with Cloudinary media cleanup)
router.delete('/:storyId', authMiddleware, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.uid;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Only story owner can delete
    if (story.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only delete your own stories'
      });
    }

    // Delete media from Cloudinary if URL is a Cloudinary URL
    if (story.mediaUrl && story.mediaUrl.includes('cloudinary.com')) {
      try {
        const cloudinary = require('../config/cloudinary');
        // Extract public_id from Cloudinary URL
        // URL format: https://res.cloudinary.com/{cloud}/image/upload/v{version}/vibespace/stories/{publicId}
        const urlParts = story.mediaUrl.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        if (uploadIndex !== -1) {
          // Get everything after 'upload/v{version}/' as the public_id
          const afterUpload = urlParts.slice(uploadIndex + 2).join('/');
          const publicId = afterUpload.replace(/\.[^.]+$/, ''); // remove file extension
          await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        }
      } catch (cloudinaryError) {
        // Log but don't fail - story document should still be deleted
        console.warn('Failed to delete story media from Cloudinary:', cloudinaryError.message);
      }
    }

    await Story.findByIdAndDelete(storyId);
    return res.json({ success: true, message: 'Story deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
