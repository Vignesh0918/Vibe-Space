const express = require('express');
const router = express.Router();
const Circle = require('../models/Circle');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const createCircleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(50),
    type: z.string().min(1).max(50),
    description: z.string().optional().nullable(),
  })
});

const addMemberSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
  })
});

// Create a new circle
router.post('/', authMiddleware, validate(createCircleSchema), async (req, res) => {
  try {
    const { name, type, description } = req.body;
    const ownerId = req.user.uid;

    const newCircle = new Circle({
      name,
      type,
      description,
      ownerId,
      members: [ownerId], // Owner is automatically a member
    });

    await newCircle.save();
    return res.status(201).json({ success: true, data: newCircle });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Pre-populate default circles for a user (called during profile creation or manually)
router.post('/defaults', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Check if defaults already exist
    const count = await Circle.countDocuments({ ownerId: userId });
    if (count > 0) {
      return res.json({ success: true, message: 'Circles already initialized' });
    }

    const defaultCircles = [
      { name: 'Friends', type: 'Friends', ownerId: userId, members: [userId], description: 'Share vibes with close friends' },
      { name: 'Family', type: 'Family', ownerId: userId, members: [userId], description: 'Share vibes with family members' },
      { name: 'Work', type: 'Work', ownerId: userId, members: [userId], description: 'Share vibes with work colleagues' },
      { name: 'Secret', type: 'Secret', ownerId: userId, members: [userId], description: 'Private thoughts and secret vibes' },
    ];

    const docs = await Circle.insertMany(defaultCircles);
    return res.json({ success: true, data: docs });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get all circles user is a member of
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const circles = await Circle.find({ members: userId });
    return res.json({ success: true, data: circles });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get circle details
router.get('/:circleId', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const circle = await Circle.findById(circleId);
    if (!circle) {
      return res.status(404).json({ success: false, error: 'Circle not found' });
    }
    return res.json({ success: true, data: circle });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Add member to circle
router.post('/:circleId/members', authMiddleware, validate(addMemberSchema), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { userId } = req.body;

    const updatedCircle = await Circle.findByIdAndUpdate(
      circleId,
      { $addToSet: { members: userId } },
      { new: true }
    );

    if (!updatedCircle) {
      return res.status(404).json({ success: false, error: 'Circle not found' });
    }

    return res.json({ success: true, data: updatedCircle });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Remove member from circle
router.delete('/:circleId/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { circleId, userId } = req.params;

    const updatedCircle = await Circle.findByIdAndUpdate(
      circleId,
      { $pull: { members: userId } },
      { new: new Circle }
    );

    if (!updatedCircle) {
      return res.status(404).json({ success: false, error: 'Circle not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete circle
router.delete('/:circleId', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const deletedCircle = await Circle.findByIdAndDelete(circleId);
    if (!deletedCircle) {
      return res.status(404).json({ success: false, error: 'Circle not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
