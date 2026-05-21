const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const dmChatSchema = z.object({
  body: z.object({
    recipientId: z.string().min(1),
  })
});

const groupChatSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    participantIds: z.array(z.string().min(1)),
  })
});

const sendMessageSchema = z.object({
  body: z.object({
    text: z.string().optional().nullable(),
    mediaUrl: z.string().optional().nullable(),
    mediaType: z.string().optional().nullable(),
  })
});

const setExpirySchema = z.object({
  body: z.object({
    hours: z.number().nonnegative(),
  })
});

// Get or create DM chat room
router.post('/dm', authMiddleware, validate(dmChatSchema), async (req, res) => {
  try {
    const { recipientId } = req.body;
    const userId = req.user.uid;

    const participants = [userId, recipientId].sort();
    
    // Find an existing 1-on-1 chat
    let chat = await Chat.findOne({
      isGroup: false,
      participants: { $all: participants, $size: 2 }
    });

    if (chat) {
      return res.json({ success: true, data: chat });
    }

    // Otherwise, create a new one
    const unreadCounts = {
      [userId]: 0,
      [recipientId]: 0,
    };

    const newChat = new Chat({
      participants,
      isGroup: false,
      name: '',
      expiryHours: 0,
      lastMessage: null,
      unreadCounts,
    });

    await newChat.save();
    return res.status(201).json({ success: true, data: newChat });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create Group Chat
router.post('/group', authMiddleware, validate(groupChatSchema), async (req, res) => {
  try {
    const { name, participantIds } = req.body;
    const creatorId = req.user.uid;

    const participants = Array.from(new Set([creatorId, ...participantIds]));
    
    const unreadCounts = {};
    participants.forEach((uid) => {
      unreadCounts[uid] = 0;
    });

    const newChat = new Chat({
      name,
      creatorId,
      participants,
      isGroup: true,
      expiryHours: 0,
      lastMessage: null,
      unreadCounts,
    });

    await newChat.save();
    return res.status(201).json({ success: true, data: newChat });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Send Message in a chat
router.post('/:chatId/messages', authMiddleware, validate(sendMessageSchema), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text, mediaUrl, mediaType } = req.body;
    const senderId = req.user.uid;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat room not found' });
    }

    const expiryHours = chat.expiryHours || 0;
    let expiresAt = null;

    if (expiryHours > 0) {
      expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    }

    const newMessage = new Message({
      chatId,
      senderId,
      text: text || '',
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || '',
      expiryHours,
      expiresAt,
    });

    await newMessage.save();

    // Update parent chat room lastMessage
    const lastMsgText = text || (mediaType === 'voice' ? '🎤 Voice message' : '📷 Media photo');
    chat.lastMessage = {
      text: lastMsgText,
      senderId,
      createdAt: new Date(),
      readBy: [senderId],
    };

    // Increment unread counts for all other participants
    chat.participants.forEach((uid) => {
      if (uid !== senderId) {
        const count = chat.unreadCounts.get(uid) || 0;
        chat.unreadCounts.set(uid, count + 1);
      }
    });

    // Mark modifications so Mongoose saves Map changes
    chat.markModified('unreadCounts');
    chat.markModified('lastMessage');
    await chat.save();

    return res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get Messages in a chat (only non-expired ones)
router.get('/:chatId/messages', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const now = new Date();

    const messages = await Message.find({
      chatId,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    }).sort({ createdAt: 1 });

    return res.json({ success: true, data: messages });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get User Chats
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const chats = await Chat.find({
      participants: userId
    }).sort({ 'lastMessage.createdAt': -1 });

    return res.json({ success: true, data: chats });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Mark messages as read
router.post('/:chatId/read', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.uid;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    // Set unread count for user to 0
    chat.unreadCounts.set(userId, 0);

    // Append user to lastMessage.readBy
    if (chat.lastMessage && chat.lastMessage.readBy) {
      if (!chat.lastMessage.readBy.includes(userId)) {
        chat.lastMessage.readBy.push(userId);
      }
    }

    chat.markModified('unreadCounts');
    chat.markModified('lastMessage');
    await chat.save();

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Set Chat expiry hours
router.post('/:chatId/expiry', authMiddleware, validate(setExpirySchema), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { hours } = req.body;

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { $set: { expiryHours: hours } },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a message
router.delete('/:chatId/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    const deletedMessage = await Message.findByIdAndDelete(messageId);
    if (!deletedMessage) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get total unread count for user across all chats
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const chats = await Chat.find({ participants: userId });

    let total = 0;
    chats.forEach((chat) => {
      if (chat.unreadCounts) {
        total += chat.unreadCounts.get(userId) || 0;
      }
    });

    return res.json({ success: true, data: total });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
