const express = require('express');
const router = express.Router();
const NearbyVibe = require('../models/NearbyVibe');
const authMiddleware = require('../middleware/auth');

// Get nearby vibes
router.get('/vibes', authMiddleware, async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query; // default 10km

    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Latitude (lat) and longitude (lng) are required' });
    }

    const vibes = await NearbyVibe.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          distanceField: "distance",
          maxDistance: parseFloat(radius) * 1000,
          spherical: true
        }
      },
      {
        $match: {
          expiresAt: { $gt: new Date() }
        }
      },
      {
        $project: {
          _id: 1,
          emoji: 1,
          title: 1,
          tags: 1,
          memberCount: 1,
          joinedBy: 1,
          creatorId: 1,
          expiresAt: 1,
          distance: { $round: [{ $divide: ["$distance", 1000] }, 1] } // distance in km rounded to 1 decimal place
        }
      }
    ]);

    return res.json({ success: true, data: vibes });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create anonymous nearby vibe
router.post('/vibes', authMiddleware, async (req, res) => {
  try {
    const { lat, lng, emoji, title, tags, expiresInHours = 24 } = req.body;
    const creatorId = req.user.uid;

    if (!lat || !lng || !emoji || !title) {
      return res.status(400).json({ success: false, error: 'lat, lng, emoji, and title are required' });
    }

    const expiresAt = new Date(Date.now() + parseFloat(expiresInHours) * 60 * 60 * 1000);

    const newNearbyVibe = new NearbyVibe({
      creatorId,
      emoji,
      title,
      tags: tags || [],
      memberCount: 1,
      location: {
        type: 'Point',
        coordinates: [parseFloat(lng), parseFloat(lat)] // lng first
      },
      expiresAt,
      joinedBy: [creatorId]
    });

    await newNearbyVibe.save();
    return res.status(201).json({ success: true, data: newNearbyVibe });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Join a nearby vibe bubble
router.post('/vibes/:vibeId/join', authMiddleware, async (req, res) => {
  try {
    const { vibeId } = req.params;
    const userId = req.user.uid;

    const vibe = await NearbyVibe.findById(vibeId);
    if (!vibe) {
      return res.status(404).json({ success: false, error: 'Nearby vibe not found' });
    }

    if (vibe.joinedBy.includes(userId)) {
      return res.json({ success: true, message: 'Already joined', data: vibe });
    }

    vibe.joinedBy.push(userId);
    vibe.memberCount = vibe.joinedBy.length;
    await vibe.save();

    return res.json({ success: true, data: vibe });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete own nearby vibe bubble
router.delete('/vibes/:vibeId', authMiddleware, async (req, res) => {
  try {
    const { vibeId } = req.params;
    const userId = req.user.uid;

    const vibe = await NearbyVibe.findById(vibeId);
    if (!vibe) {
      return res.status(404).json({ success: false, error: 'Nearby vibe not found' });
    }

    if (vibe.creatorId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await NearbyVibe.findByIdAndDelete(vibeId);
    return res.json({ success: true, message: 'Nearby vibe deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
