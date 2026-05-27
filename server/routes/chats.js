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

const editMessageSchema = z.object({
  body: z.object({
    text: z.string().min(1),
  }),
  params: z.object({
    chatId: z.string().min(1),
    messageId: z.string().min(1),
  })
});

// Get or create DM chat room
router.post('/dm', authMiddleware, validate(dmChatSchema), async (req, res) => {
  try {
    let { recipientId } = req.body;
    const userId = req.user.uid;
    const mongoose = require('mongoose');
    const User = require('../models/User');

    if (mongoose.Types.ObjectId.isValid(recipientId)) {
      const userDoc = await User.findById(recipientId);
      if (userDoc) {
        recipientId = userDoc.uid;
      }
    }

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
    const mongoose = require('mongoose');
    const User = require('../models/User');

    const resolvedParticipantIds = [];
    for (const pid of participantIds) {
      if (mongoose.Types.ObjectId.isValid(pid)) {
        const userDoc = await User.findById(pid);
        if (userDoc) {
          resolvedParticipantIds.push(userDoc.uid);
        } else {
          resolvedParticipantIds.push(pid);
        }
      } else {
        resolvedParticipantIds.push(pid);
      }
    }

    const participants = Array.from(new Set([creatorId, ...resolvedParticipantIds]));
    
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

    // Verify sender is participant in chat
    if (!chat.participants.includes(senderId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
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

    // Broadcast new message via WebSockets
    const { sendToChatParticipants } = require('../config/websocket');
    sendToChatParticipants(chatId, senderId, {
      type: 'new_message',
      chatId,
      message: newMessage
    });

    return res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get Messages in a chat (only non-expired ones)
router.get('/:chatId/messages', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat room not found' });
    }

    // Verify requesting user is participant in chat
    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

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

    if (userId !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: You cannot access other users\' chats' });
    }

    const chats = await Chat.find({
      participants: userId
    }).sort({ 'lastMessage.createdAt': -1 });

    const User = require('../models/User');
    const populatedChats = [];

    for (let chat of chats) {
      const userProfiles = await User.find({ uid: { $in: chat.participants } }).select('uid username displayName photoURL isOnline lastSeen mood');
      populatedChats.push({
        ...chat.toObject(),
        participantDetails: userProfiles
      });
    }

    return res.json({ success: true, data: populatedChats });
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

    // Verify requester is participant in chat
    if (!chat.participants.includes(userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
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

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    // Verify requester is participant in chat
    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

    chat.expiryHours = hours;
    await chat.save();

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a message
router.delete('/:chatId/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Verify requester is the sender of the message
    if (message.senderId !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: You cannot delete this message' });
    }

    await Message.findByIdAndDelete(messageId);

    // Broadcast deleted message via WebSockets
    const { sendToChatParticipants } = require('../config/websocket');
    sendToChatParticipants(req.params.chatId, req.user.uid, {
      type: 'delete_message',
      chatId: req.params.chatId,
      messageId
    });

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

// Get single chat room details
router.get('/:chatId', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat room not found' });
    }
    // Verify requester is in the chat
    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }
    const User = require('../models/User');
    const userProfiles = await User.find({ uid: { $in: chat.participants } }).select('uid username displayName photoURL isOnline lastSeen mood');
    return res.json({
      success: true,
      data: {
        ...chat.toObject(),
        participantDetails: userProfiles
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update group name/avatar
router.put('/:chatId', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { name, groupAvatar } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Only group chats can be updated' });
    }

    if (name) chat.name = name;
    if (groupAvatar !== undefined) chat.groupAvatar = groupAvatar;

    await chat.save();
    return res.json({ success: true, data: chat });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete or leave chat room
router.delete('/:chatId', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.uid;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    // Verify requester is in the chat
    if (!chat.participants.includes(userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

    if (chat.isGroup) {
      chat.participants = chat.participants.filter(id => id !== userId);
      if (chat.unreadCounts) {
        chat.unreadCounts.delete(userId);
      }
      
      if (chat.participants.length === 0) {
        await Message.deleteMany({ chatId });
        await Chat.findByIdAndDelete(chatId);
        return res.json({ success: true, message: 'Group deleted since all participants left' });
      } else {
        chat.markModified('unreadCounts');
        await chat.save();
        return res.json({ success: true, message: 'Left group successfully' });
      }
    } else {
      await Message.deleteMany({ chatId });
      await Chat.findByIdAndDelete(chatId);
      return res.json({ success: true, message: 'DM deleted successfully' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Add member to group chat
router.post('/:chatId/members', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    let { userId } = req.body;
    const mongoose = require('mongoose');
    const User = require('../models/User');

    if (mongoose.Types.ObjectId.isValid(userId)) {
      const userDoc = await User.findById(userId);
      if (userDoc) {
        userId = userDoc.uid;
      }
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Not a group chat' });
    }

    if (chat.participants.includes(userId)) {
      return res.status(400).json({ success: false, error: 'User already in group' });
    }

    chat.participants.push(userId);
    if (chat.unreadCounts) {
      chat.unreadCounts.set(userId, 0);
    }

    chat.markModified('unreadCounts');
    await chat.save();

    return res.json({ success: true, data: chat });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Remove member from group chat
router.delete('/:chatId/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    let { userId } = req.params;
    const mongoose = require('mongoose');
    const User = require('../models/User');

    if (mongoose.Types.ObjectId.isValid(userId)) {
      const userDoc = await User.findById(userId);
      if (userDoc) {
        userId = userDoc.uid;
      }
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Not a group chat' });
    }

    // Only allow removal if the requester is the user themselves (leaving) OR the group creator
    if (userId !== req.user.uid && chat.creatorId !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the group creator or the member themselves can remove this member' });
    }

    chat.participants = chat.participants.filter(id => id !== userId);
    if (chat.unreadCounts) {
      chat.unreadCounts.delete(userId);
    }

    chat.markModified('unreadCounts');
    await chat.save();

    return res.json({ success: true, data: chat });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Edit a sent message
router.put('/:chatId/messages/:messageId', authMiddleware, validate(editMessageSchema), async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.user.uid;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (message.senderId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const diffMs = Date.now() - message.createdAt.getTime();
    const diffMins = diffMs / (1000 * 60);
    if (diffMins > 15) {
      return res.status(400).json({ success: false, error: 'Cannot edit message after 15 minutes' });
    }

    message.text = text;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    // Broadcast edited message via WebSockets
    const { sendToChatParticipants } = require('../config/websocket');
    sendToChatParticipants(req.params.chatId, userId, {
      type: 'edit_message',
      chatId: req.params.chatId,
      message
    });

    return res.json({ success: true, data: message });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get media messages in chat
router.get('/:chatId/media', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }
    // Verify requester is in the chat
    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }
    const mediaMessages = await Message.find({
      chatId,
      mediaUrl: { $ne: '' }
    }).sort({ createdAt: -1 });

    return res.json({ success: true, data: mediaMessages });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Pin a message in group chat
router.post('/:chatId/pin/:messageId', authMiddleware, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    // Verify requester is in the chat
    if (!chat.participants.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

    chat.pinnedMessageId = messageId;
    await chat.save();

    return res.json({ success: true, data: chat });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// React to a message
router.post('/:chatId/messages/:messageId/react', authMiddleware, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.uid;

    if (!emoji) {
      return res.status(400).json({ success: false, error: 'Emoji is required' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }

    // Verify requester is in the chat
    if (!chat.participants.includes(userId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this chat' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (!message.reactions) {
      message.reactions = new Map();
    }

    const userList = message.reactions.get(emoji) || [];
    let updatedList;
    if (userList.includes(userId)) {
      updatedList = userList.filter(id => id !== userId);
    } else {
      updatedList = [...userList, userId];
    }

    if (updatedList.length === 0) {
      message.reactions.delete(emoji);
    } else {
      message.reactions.set(emoji, updatedList);
    }

    message.markModified('reactions');
    await message.save();

    // Broadcast reaction change via WebSockets
    const { sendToChatParticipants } = require('../config/websocket');
    sendToChatParticipants(chatId, userId, {
      type: 'react_message',
      chatId,
      messageId,
      reactions: Object.fromEntries(message.reactions)
    });

    return res.json({ success: true, data: Object.fromEntries(message.reactions) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
