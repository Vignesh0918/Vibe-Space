/**
 * geminiService.js
 * Central service for all Gemini AI interactions in VibeSpace.
 * Uses Google's Gemini 1.5 Flash (free tier) for content generation.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;

let genAI = null;
let model = null;

if (API_KEY) {
  genAI = new GoogleGenerativeAI(API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  console.log('[Gemini] Service initialized with gemini-2.5-flash');
} else {
  console.warn('[Gemini] GEMINI_API_KEY not set. AI features will be unavailable.');
}

/**
 * Parses a JSON response from Gemini, handling markdown code fences.
 * Gemini sometimes wraps JSON in ```json ... ``` blocks.
 */
function parseGeminiJSON(text) {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  return JSON.parse(cleaned);
}

/**
 * Ensures the Gemini model is available before making a call.
 */
function ensureModel() {
  if (!model) {
    throw new Error('Gemini AI is not configured. Set GEMINI_API_KEY in your .env file.');
  }
}

// ─────────────────────────────────────────────
// 1️⃣ AI Caption Generator (Photo Upload)
// ─────────────────────────────────────────────

/**
 * Analyzes an image and generates captions, hashtags, and mood.
 * @param {string} imageBase64 - Base64-encoded image data.
 * @param {string} mimeType - Image MIME type (e.g. 'image/jpeg').
 * @param {string} circleType - Circle context (Friends/Family/Work/Secret).
 * @returns {Promise<{caption, hashtags, mood, alt_captions}>}
 */
async function generateCaption(imageBase64, mimeType, circleType = 'Friends') {
  ensureModel();

  const prompt = `You are a creative social media assistant for VibeSpace, 
a premium dark-themed social app used by young Indians.

Analyze this image and generate:
1. A catchy, engaging caption (max 150 chars) that feels authentic and trendy - mix of English with occasional Hindi/Tamil words is fine
2. 5-8 relevant hashtags
3. A mood emoji that best represents this image

The tone should be: Gen-Z, cool, not too formal.

User's circle type: ${circleType} (Friends/Family/Work/Secret)

Response ONLY in this JSON format:
{
  "caption": "your caption here",
  "hashtags": ["#tag1", "#tag2"],
  "mood": "🔥",
  "alt_captions": ["option 2", "option 3"]
}`;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType || 'image/jpeg',
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const text = result.response.text();
  return parseGeminiJSON(text);
}

// ─────────────────────────────────────────────
// 2️⃣ Smart Chat Reply Suggestions
// ─────────────────────────────────────────────

/**
 * Generates 3 smart reply suggestions for a chat message.
 * @param {string} lastMessage - The last message received.
 * @param {string} senderName - Name of the message sender.
 * @param {boolean} isGroup - Whether this is a group chat.
 * @returns {Promise<{replies: Array<{text, type}>}>}
 */
async function suggestReplies(lastMessage, senderName, isGroup = false) {
  ensureModel();

  const prompt = `You are a smart reply assistant for VibeSpace chat.

Analyze this conversation and suggest 3 short, natural reply options.

Conversation context:
- Chat type: ${isGroup ? 'Group Chat' : 'Direct Message'}
- Last message: "${lastMessage}"
- Sender name: "${senderName}"

Rules:
- Each reply max 8 words
- Should feel natural, not robotic
- Mix casual English with some Indian slang if appropriate
- One reply should be funny/emoji-based
- One should be serious/informative  
- One should be a question to continue conversation

Response ONLY in this JSON format:
{
  "replies": [
    {"text": "reply 1", "type": "casual"},
    {"text": "reply 2", "type": "funny"},
    {"text": "reply 3", "type": "question"}
  ]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGeminiJSON(text);
}

// ─────────────────────────────────────────────
// 3️⃣ Mood Detector from Post Caption
// ─────────────────────────────────────────────

/**
 * Detects mood/emotion from a post caption.
 * @param {string} userCaption - The post caption to analyze.
 * @returns {Promise<{detected_mood, mood_emoji, confidence, should_update_profile, vibe_comment, secondary_mood}>}
 */
async function detectMood(userCaption) {
  ensureModel();

  const prompt = `You are a mood analysis assistant for VibeSpace.

Analyze this social media post caption and detect the user's current mood/emotion.

Caption: "${userCaption}"

Available moods in our app:
- Happy 😊
- Tired 😴  
- Hyped 🔥
- Stressed 🤯
- Chill 😇
- Coding 💻
- Chilling 🍿
- Traveling ✈️

Tasks:
1. Detect primary mood from caption
2. Give confidence score (0-100)
3. Suggest if they should update their profile mood
4. Give a fun one-line comment about their vibe

Response ONLY in this JSON format:
{
  "detected_mood": "Happy",
  "mood_emoji": "😊",
  "confidence": 85,
  "should_update_profile": true,
  "vibe_comment": "You're radiating good energy today! ✨",
  "secondary_mood": "Hyped"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGeminiJSON(text);
}

// ─────────────────────────────────────────────
// 4️⃣ Circle Name Generator
// ─────────────────────────────────────────────

/**
 * Generates creative circle name suggestions.
 * @param {string} circleType - Type of circle.
 * @param {string} selectedEmoji - Emoji chosen by user.
 * @param {string} privacy - Privacy level (Open/Invite Only/Secret).
 * @param {number} memberCount - Expected member count.
 * @returns {Promise<{suggestions: Array<{name, vibe, emoji_match}>, best_pick}>}
 */
async function generateCircleNames(circleType, selectedEmoji, privacy, memberCount) {
  ensureModel();

  const prompt = `You are a creative naming assistant for VibeSpace social circles.

Generate creative circle names based on:
- Circle type: ${circleType}
- Selected emoji: ${selectedEmoji}
- Privacy: ${privacy} (Open/Invite Only/Secret)
- Member count hint: ${memberCount} people

VibeSpace circles are like private social groups. 
Names should be:
- Fun and memorable
- 2-4 words max
- Feel like a cool squad name
- Relevant to the circle type

Response ONLY in this JSON format:
{
  "suggestions": [
    {
      "name": "Neon Nights",
      "vibe": "mysterious and cool",
      "emoji_match": "✨"
    },
    {
      "name": "The Inner Circle", 
      "vibe": "exclusive and premium",
      "emoji_match": "🔥"
    },
    {
      "name": "Cosmic Squad",
      "vibe": "fun and energetic", 
      "emoji_match": "🚀"
    }
  ],
  "best_pick": "Neon Nights"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGeminiJSON(text);
}

// ─────────────────────────────────────────────
// 5️⃣ Daily Vibe Summary (Notifications)
// ─────────────────────────────────────────────

/**
 * Generates a fun daily summary of user activity.
 * @param {object} activityData - Activity stats object.
 * @returns {Promise<{summary, highlight, motivation, day_rating}>}
 */
async function generateDailySummary(activityData) {
  ensureModel();

  const {
    followersCount = 0,
    reactionsCount = 0,
    commentsCount = 0,
    messagesCount = 0,
    circlesActive = 0,
    topEmoji = '❤️',
  } = activityData;

  const prompt = `You are a friendly daily digest assistant for VibeSpace.

Summarize this user's day activity in a fun, engaging paragraph. Write like a friend updating them.

Today's activity data:
- New followers: ${followersCount}
- Post reactions received: ${reactionsCount}
- Comments received: ${commentsCount}  
- New messages: ${messagesCount}
- Circles active: ${circlesActive}
- Top reaction emoji: ${topEmoji}

Rules:
- Max 3 sentences
- Conversational, warm tone
- Include relevant emojis naturally
- End with an encouraging note
- Feel like a WhatsApp message from a friend

Response ONLY in this JSON format:
{
  "summary": "your 3 sentence summary here",
  "highlight": "best thing that happened today",
  "motivation": "short encouraging message",
  "day_rating": "🔥 Lit Day"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGeminiJSON(text);
}

// ─────────────────────────────────────────────
// 6️⃣ Nearby Vibe Title Suggester
// ─────────────────────────────────────────────

/**
 * Generates catchy titles for nearby vibe bubbles.
 * @param {string} vibeEmoji - Selected emoji for the vibe.
 * @param {string} locationHint - Location context (or 'Unknown').
 * @param {string} timeOfDay - Morning/Afternoon/Evening/Night.
 * @param {string[]} userTags - Tags entered by the user.
 * @returns {Promise<{suggestions: string[], best_match: string}>}
 */
async function suggestVibeTitles(vibeEmoji, locationHint, timeOfDay, userTags) {
  ensureModel();

  const prompt = `You are a creative vibe naming assistant for VibeSpace Nearby Vibes feature.

Generate catchy titles for a nearby vibe bubble based on:
- Selected emoji: ${vibeEmoji}
- Location type hint: ${locationHint || 'Unknown'}
- Time of day: ${timeOfDay} (Morning/Afternoon/Evening/Night)
- Tags entered: ${Array.isArray(userTags) ? userTags.join(', ') : userTags || 'none'}

Nearby Vibes are anonymous location-based activity bubbles.
Titles should be:
- Short (3-5 words max)
- Intriguing and inviting
- Make people want to join
- Match the emoji vibe

Response ONLY in this JSON format:
{
  "suggestions": [
    "Late Night Coffee Run",
    "Midnight Coding Session", 
    "Vibe Check Central",
    "Spontaneous Hangout",
    "Chill Zone Loading..."
  ],
  "best_match": "Late Night Coffee Run"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGeminiJSON(text);
}

module.exports = {
  generateCaption,
  suggestReplies,
  detectMood,
  generateCircleNames,
  generateDailySummary,
  suggestVibeTitles,
};
