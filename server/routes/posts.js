const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const Circle = require('../models/Circle');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');

const editPostSchema = z.object({
  body: z.object({
    caption: z.string().min(1)
  })
});

const bookmarkSchema = z.object({
  params: z.object({
    postId: z.string().min(1)
  })
});

const createPostSchema = z.object({
  body: z.object({
    caption: z.string().optional().nullable(),
    imageURL: z.string().url(),
    circleId: z.string().min(1),
    userName: z.string().min(1),
    userAvatar: z.string().optional().nullable(),
  })
});

const reactPostSchema = z.object({
  body: z.object({
    emoji: z.string().min(1),
    userName: z.string().min(1),
    userAvatar: z.string().optional().nullable(),
  })
});

const commentPostSchema = z.object({
  body: z.object({
    userName: z.string().min(1),
    userAvatar: z.string().optional().nullable(),
    text: z.string().min(1),
  })
});

// Create post
router.post('/', authMiddleware, validate(createPostSchema), async (req, res) => {
  try {
    const { caption, imageURL, circleId, userName, userAvatar } = req.body;
    const userId = req.user.uid;

    const newPost = new Post({
      caption,
      imageURL,
      circleId,
      userId,
      userName,
      userAvatar,
      reactions: {},
      commentsCount: 0,
    });

    await newPost.save();

    // Increment user postsCount
    await User.findOneAndUpdate({ uid: userId }, { $inc: { postsCount: 1 } });

    // Increment circle postsCount
    await Circle.findByIdAndUpdate(circleId, { $inc: { postsCount: 1 } });

    return res.status(201).json({ success: true, data: newPost });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get home feed (all posts from any user in the database)
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    const { lastId, limit = 10 } = req.query;
    const limitCount = parseInt(limit);
    const query = {};

    if (lastId) {
      const lastPost = await Post.findById(lastId);
      if (lastPost) {
        query.createdAt = { $lt: lastPost.createdAt };
      }
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limitCount);

    const lastVisible = posts.length > 0 ? posts[posts.length - 1]._id : null;

    return res.json({
      success: true,
      data: {
        posts,
        lastDoc: lastVisible,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get circle posts
router.get('/circle/:circleId', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;

    const circle = await Circle.findById(circleId);
    if (!circle) {
      return res.status(404).json({ success: false, error: 'Circle not found' });
    }

    // Verify requester is a member of the circle
    if (!circle.members.includes(req.user.uid)) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a member of this circle' });
    }

    const { lastId, limit = 10 } = req.query;
    const limitCount = parseInt(limit);

    const query = { circleId };

    if (lastId) {
      const lastPost = await Post.findById(lastId);
      if (lastPost) {
        query.createdAt = { $lt: lastPost.createdAt };
      }
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limitCount);

    const lastVisible = posts.length > 0 ? posts[posts.length - 1]._id : null;

    return res.json({
      success: true,
      data: {
        posts,
        lastDoc: lastVisible,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user posts
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    let query = { userId };
    if (userId !== req.user.uid) {
      // Find all circles where req.user.uid is a member
      const userCircles = await Circle.find({ members: req.user.uid }).select('_id');
      const validCircleIds = userCircles.map(c => c._id.toString());
      query.circleId = { $in: validCircleIds };
    }

    const posts = await Post.find(query).sort({ createdAt: -1 });
    return res.json({ success: true, data: posts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle reaction emoji on a post
router.post('/:postId/react', authMiddleware, validate(reactPostSchema), async (req, res) => {
  try {
    const { postId } = req.params;
    const { emoji, userName, userAvatar } = req.body;
    const userId = req.user.uid;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // reactions is a Map. Mongoose returns Map, so we get/set using standard Map operations
    if (!post.reactions) {
      post.reactions = new Map();
    }

    const emojiUsers = post.reactions.get(emoji) || [];
    let action = 'added';
    let updatedUsers;

    if (emojiUsers.includes(userId)) {
      updatedUsers = emojiUsers.filter(id => id !== userId);
      action = 'removed';
    } else {
      updatedUsers = [...emojiUsers, userId];
      action = 'added';
    }

    post.reactions.set(emoji, updatedUsers);
    await post.save();

    // Notify owner
    if (action === 'added' && post.userId !== userId) {
      const newNotification = new Notification({
        userId: post.userId,
        type: 'reaction',
        senderId: userId,
        senderName: userName,
        senderAvatar: userAvatar || '',
        postId: post._id,
        postImage: post.imageURL || '',
        text: `reacted ${emoji} to your post`,
      });
      await newNotification.save();
    }

    return res.json({ success: true, action });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Add comment to a post
router.post('/:postId/comment', authMiddleware, validate(commentPostSchema), async (req, res) => {
  try {
    const { postId } = req.params;
    const { userName, userAvatar, text } = req.body;
    const userId = req.user.uid;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const newComment = new Comment({
      postId,
      userId,
      userName,
      userAvatar,
      text,
    });

    await newComment.save();

    // Increment comment count on Post
    post.commentsCount = (post.commentsCount || 0) + 1;
    await post.save();

    // Notify owner
    if (post.userId !== userId) {
      const truncatedComment = text.substring(0, 30) + (text.length > 30 ? '...' : '');
      const newNotification = new Notification({
        userId: post.userId,
        type: 'comment',
        senderId: userId,
        senderName: userName,
        senderAvatar: userAvatar || '',
        postId: post._id,
        postImage: post.imageURL || '',
        text: `commented: "${truncatedComment}"`,
      });
      await newNotification.save();
    }

    return res.json({ success: true, data: newComment });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get comments for a post
router.get('/:postId/comments', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const comments = await Comment.find({ postId }).sort({ createdAt: 1 });
    return res.json({ success: true, data: comments });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a post
router.delete('/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Only the post owner can delete the post
    if (post.userId !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this post' });
    }

    // Decrement counts
    await User.findOneAndUpdate({ uid: post.userId }, { $inc: { postsCount: -1 } });
    await Circle.findByIdAndUpdate(post.circleId, { $inc: { postsCount: -1 } });

    // Delete post comments
    await Comment.deleteMany({ postId });

    // Delete post document
    await Post.findByIdAndDelete(postId);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's bookmarked posts
router.get('/bookmarked/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: You cannot access other users\' bookmarks' });
    }

    const posts = await Post.find({ bookmarkedBy: userId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: posts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get trending posts last 24h
router.get('/trending', authMiddleware, async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let posts = await Post.find({ createdAt: { $gte: last24h } });

    const getReactionsCount = (post) => {
      let count = 0;
      if (post.reactions) {
        if (post.reactions instanceof Map) {
          post.reactions.forEach(usersList => {
            count += (usersList || []).length;
          });
        } else {
          Object.values(post.reactions).forEach(usersList => {
            count += (usersList || []).length;
          });
        }
      }
      return count;
    };

    posts.sort((a, b) => getReactionsCount(b) - getReactionsCount(a));

    if (posts.length === 0) {
      posts = await Post.find().limit(20);
      posts.sort((a, b) => getReactionsCount(b) - getReactionsCount(a));
    }

    return res.json({ success: true, data: posts.slice(0, 10) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Bookmark / unbookmark toggle
router.post('/:postId/bookmark', authMiddleware, validate(bookmarkSchema), async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.uid;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    let isBookmarked = false;
    if (post.bookmarkedBy.includes(userId)) {
      post.bookmarkedBy = post.bookmarkedBy.filter(id => id !== userId);
    } else {
      post.bookmarkedBy.push(userId);
      isBookmarked = true;
    }

    await post.save();
    return res.json({ success: true, isBookmarked, bookmarkedBy: post.bookmarkedBy });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Edit post caption
router.put('/:postId', authMiddleware, validate(editPostSchema), async (req, res) => {
  try {
    const { postId } = req.params;
    const { caption } = req.body;
    const userId = req.user.uid;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    post.caption = caption;
    post.isEdited = true;
    await post.save();

    return res.json({ success: true, data: post });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get a single post by ID
router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    return res.json({ success: true, data: post });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
