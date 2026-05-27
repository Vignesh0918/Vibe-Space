/**
 * ai.js — AI Routes
 * Express router for all Gemini-powered AI features in VibeSpace.
 * All routes are POST, auth-protected, and Zod-validated.
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { z } = require('zod');
const validate = require('../middleware/validate');
const {
  generateCaption,
  suggestReplies,
  detectMood,
  generateCircleNames,
  generateDailySummary,
  suggestVibeTitles,
} = require('../services/geminiService');

// ─────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────

const captionSchema = z.object({
  body: z.object({
    imageBase64: z.string().min(1),
    mimeType: z.string().optional().default('image/jpeg'),
    circleType: z.string().optional().default('Friends'),
  }),
});

const smartReplySchema = z.object({
  body: z.object({
    lastMessage: z.string().min(1),
    senderName: z.string().min(1),
    isGroup: z.boolean().optional().default(false),
  }),
});

const detectMoodSchema = z.object({
  body: z.object({
    caption: z.string().min(1),
  }),
});

const circleNamesSchema = z.object({
  body: z.object({
    circleType: z.string().min(1),
    selectedEmoji: z.string().optional().default('✨'),
    privacy: z.string().optional().default('Invite Only'),
    memberCount: z.number().optional().default(5),
  }),
});

const dailySummarySchema = z.object({
  body: z.object({
    followersCount: z.number().optional().default(0),
    reactionsCount: z.number().optional().default(0),
    commentsCount: z.number().optional().default(0),
    messagesCount: z.number().optional().default(0),
    circlesActive: z.number().optional().default(0),
    topEmoji: z.string().optional().default('❤️'),
  }),
});

const vibeTitlesSchema = z.object({
  body: z.object({
    vibeEmoji: z.string().min(1),
    locationHint: z.string().optional().default('Unknown'),
    timeOfDay: z.string().optional().default('Evening'),
    userTags: z.array(z.string()).optional().default([]),
  }),
});

// ─────────────────────────────────────────────
// 1️⃣ AI Caption Generator
// POST /api/ai/caption
// ─────────────────────────────────────────────

router.post('/caption', authMiddleware, validate(captionSchema), async (req, res) => {
  try {
    const { imageBase64, mimeType, circleType } = req.body;
    const data = await generateCaption(imageBase64, mimeType, circleType);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[AI] Caption generation failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// 2️⃣ Smart Chat Reply Suggestions
// POST /api/ai/smart-reply
// ─────────────────────────────────────────────

router.post('/smart-reply', authMiddleware, validate(smartReplySchema), async (req, res) => {
  try {
    const { lastMessage, senderName, isGroup } = req.body;
    const data = await suggestReplies(lastMessage, senderName, isGroup);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[AI] Smart reply failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// 3️⃣ Mood Detector from Post Caption
// POST /api/ai/detect-mood
// ─────────────────────────────────────────────

router.post('/detect-mood', authMiddleware, validate(detectMoodSchema), async (req, res) => {
  try {
    const { caption } = req.body;
    const data = await detectMood(caption);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[AI] Mood detection failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// 4️⃣ Circle Name Generator
// POST /api/ai/circle-names
// ─────────────────────────────────────────────

router.post('/circle-names', authMiddleware, validate(circleNamesSchema), async (req, res) => {
  try {
    const { circleType, selectedEmoji, privacy, memberCount } = req.body;
    const data = await generateCircleNames(circleType, selectedEmoji, privacy, memberCount);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[AI] Circle name generation failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// 5️⃣ Daily Vibe Summary
// POST /api/ai/daily-summary
// ─────────────────────────────────────────────

router.post('/daily-summary', authMiddleware, validate(dailySummarySchema), async (req, res) => {
  try {
    const activityData = req.body;
    const data = await generateDailySummary(activityData);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[AI] Daily summary failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// 6️⃣ Nearby Vibe Title Suggester
// POST /api/ai/vibe-titles
// ─────────────────────────────────────────────

router.post('/vibe-titles', authMiddleware, validate(vibeTitlesSchema), async (req, res) => {
  try {
    const { vibeEmoji, locationHint, timeOfDay, userTags } = req.body;
    const data = await suggestVibeTitles(vibeEmoji, locationHint, timeOfDay, userTags);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[AI] Vibe title suggestion failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
