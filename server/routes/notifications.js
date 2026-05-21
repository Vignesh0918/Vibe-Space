const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const createNotificationSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    type: z.string().min(1),
    senderId: z.string().optional().nullable(),
    senderName: z.string().optional().nullable(),
    senderAvatar: z.string().optional().nullable(),
    postId: z.string().optional().nullable(),
    postImage: z.string().optional().nullable(),
    text: z.string().min(1),
  })
});

// Create a notification
router.post('/', authMiddleware, validate(createNotificationSchema), async (req, res) => {
  try {
    const { userId, type, senderId, senderName, senderAvatar, postId, postImage, text } = req.body;
    const newNotification = new Notification({
      userId,
      type,
      senderId,
      senderName,
      senderAvatar: senderAvatar || '',
      postId: postId || '',
      postImage: postImage || '',
      text,
      read: false,
    });
    await newNotification.save();
    return res.status(201).json({ success: true, id: newNotification._id });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get all notifications for user
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check authorization (allow user to get their own notifications)
    if (req.user.uid !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: notifications });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Mark single notification as read
router.post('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Mark all user notifications as read
router.post('/user/:userId/read-all', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.uid !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    );

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
