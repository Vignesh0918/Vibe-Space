/**
 * geminiService.js
 * Central service for all Gemini AI interactions in VibeSpace.
 * Uses Google's Gemini 1.5/2.5 Flash for content generation with auto-retries and fallback support.
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

/**
 * Calls Gemini API with automatic retry and exponential backoff for transient errors (429/503).
 * Falls back to preset mock data if all retries fail to keep the app working.
 */
async function callGeminiWithRetry(args, fallbackData) {
  ensureModel();

  const maxRetries = 3;
  let delay = 1000; // Start with 1 second delay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(args);
      const text = result.response.text();
      return parseGeminiJSON(text);
    } catch (error) {
      const isTransient = error.status === 429 || error.status === 503 || 
                          error.message.includes('429') || error.message.includes('503') ||
                          error.message.includes('quota') || error.message.includes('overloaded');

      console.warn(`[Gemini] Attempt ${attempt} failed:`, error.message);

      if (isTransient && attempt < maxRetries) {
        console.log(`[Gemini] Transient error detected. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        console.error(`[Gemini] Final attempt failed or non-transient error:`, error.message);
        if (fallbackData) {
          console.log(`[Gemini] Returning fallback data to prevent crash.`);
          return fallbackData;
        }
        throw error;
      }
    }
  }
}

// ─────────────────────────────────────────────
// 1️⃣ AI Caption Generator (Photo Upload)
// ─────────────────────────────────────────────

/**
 * Analyzes an image and generates captions, hashtags, and mood.
 */
async function generateCaption(imageBase64, mimeType, circleType = 'Friends') {
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

  // Define static fallback captions based on the circleType
  const defaultCaption = circleType === 'Family' ? "Family time is the best time. ❤️" :
                         circleType === 'Work' ? "On the grind. 💼💻" :
                         circleType === 'Secret' ? "Low key, high vibes. 🤫✨" :
                         "Chilling with the squad! 🌟";

  const defaultHashtags = circleType === 'Family' ? ["#family", "#love", "#together", "#vibespace"] :
                          circleType === 'Work' ? ["#worklife", "#hustle", "#office", "#vibespace"] :
                          circleType === 'Secret' ? ["#secret", "#lowkey", "#private", "#vibespace"] :
                          ["#vibes", "#goodtimes", "#aesthetic", "#vibespace"];

  const fallback = {
    caption: defaultCaption,
    hashtags: defaultHashtags,
    mood: circleType === 'Family' ? "❤️" : circleType === 'Work' ? "💻" : circleType === 'Secret' ? "🤫" : "🔥",
    alt_captions: ["Keeping it real. ✨", "Living my best life. 💫"]
  };

  return callGeminiWithRetry([prompt, imagePart], fallback);
}

// ─────────────────────────────────────────────
// 2️⃣ Smart Chat Reply Suggestions
// ─────────────────────────────────────────────

/**
 * Generates 3 smart reply suggestions for a chat message.
 */
async function suggestReplies(lastMessage, senderName, isGroup = false) {
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

  const fallback = {
    replies: [
      { text: "Sounds good!", type: "casual" },
      { text: "Haha true 😂", type: "funny" },
      { text: "What do you think?", type: "question" }
    ]
  };

  return callGeminiWithRetry(prompt, fallback);
}

// ─────────────────────────────────────────────
// 3️⃣ Mood Detector from Post Caption
// ─────────────────────────────────────────────

/**
 * Detects mood/emotion from a post caption.
 */
async function detectMood(userCaption) {
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
- Detect primary mood
- Confidence score (0-100)
- Suggest if profile should update
- Fun one-line vibe comment

Response ONLY in this JSON format:
{
  "detected_mood": "Happy",
  "mood_emoji": "😊",
  "confidence": 85,
  "should_update_profile": true,
  "vibe_comment": "You're radiating good energy today! ✨",
  "secondary_mood": "Hyped"
}`;

  // Smart localized keywords detection for fallback
  const captionLower = (userCaption || '').toLowerCase();
  let detected_mood = "Chill";
  let mood_emoji = "😇";
  let vibe_comment = "Keeping it chill and positive! ✨";

  if (captionLower.includes('tired') || captionLower.includes('sleep') || captionLower.includes('exhausted')) {
    detected_mood = "Tired";
    mood_emoji = "😴";
    vibe_comment = "Looks like you need some well-deserved rest! 😴";
  } else if (captionLower.includes('hype') || captionLower.includes('fire') || captionLower.includes('lit') || captionLower.includes('party')) {
    detected_mood = "Hyped";
    mood_emoji = "🔥";
    vibe_comment = "The energy is absolutely unmatched! 🔥";
  } else if (captionLower.includes('stress') || captionLower.includes('work') || captionLower.includes('exam') || captionLower.includes('dead')) {
    detected_mood = "Stressed";
    mood_emoji = "🤯";
    vibe_comment = "Take a deep breath. You've got this! 🌟";
  } else if (captionLower.includes('code') || captionLower.includes('programming') || captionLower.includes('bug')) {
    detected_mood = "Coding";
    mood_emoji = "💻";
    vibe_comment = "In the zone! Time to squash some bugs. 💻";
  } else if (captionLower.includes('travel') || captionLower.includes('flight') || captionLower.includes('trip')) {
    detected_mood = "Traveling";
    mood_emoji = "✈️";
    vibe_comment = "Safe travels! Catch those beautiful sights. ✈️";
  }

  const fallback = {
    detected_mood,
    mood_emoji,
    confidence: 80,
    should_update_profile: true,
    vibe_comment,
    secondary_mood: "Happy"
  };

  return callGeminiWithRetry(prompt, fallback);
}

// ─────────────────────────────────────────────
// 4️⃣ Circle Name Generator
// ─────────────────────────────────────────────

/**
 * Generates creative circle name suggestions.
 */
async function generateCircleNames(circleType, selectedEmoji, privacy, memberCount) {
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
    ...
  ],
  "best_pick": "Neon Nights"
}`;

  const emoji = selectedEmoji || '✨';
  let suggestions = [
    { name: `The Vibe Lounge ${emoji}`, vibe: "chill and casual space", emoji_match: emoji },
    { name: `Inner Circle ${emoji}`, vibe: "exclusive squad room", emoji_match: emoji },
    { name: `Chat & Chill ${emoji}`, vibe: "relaxed general group", emoji_match: emoji }
  ];

  if (circleType === 'Friends') {
    suggestions = [
      { name: `The Dream Team ${emoji}`, vibe: "close squad vibes", emoji_match: emoji },
      { name: `Chai & Chats ${emoji}`, vibe: "daily fun discussions", emoji_match: emoji },
      { name: `Vibe Check ${emoji}`, vibe: "casual hangouts", emoji_match: emoji }
    ];
  } else if (circleType === 'Family') {
    suggestions = [
      { name: `Fam Jam ${emoji}`, vibe: "close family updates", emoji_match: emoji },
      { name: `Home Sweet Home ${emoji}`, vibe: "family connection room", emoji_match: emoji },
      { name: `The Clan ${emoji}`, vibe: "exclusive family space", emoji_match: emoji }
    ];
  } else if (circleType === 'Work') {
    suggestions = [
      { name: `Coffee & Code ${emoji}`, vibe: "professional and relaxed", emoji_match: emoji },
      { name: `Brainstormers ${emoji}`, vibe: "creative ideas hub", emoji_match: emoji },
      { name: `The Boardroom ${emoji}`, vibe: "official group updates", emoji_match: emoji }
    ];
  } else if (circleType === 'Secret') {
    suggestions = [
      { name: `Under the Radar ${emoji}`, vibe: "super private talk", emoji_match: emoji },
      { name: `The Vault ${emoji}`, vibe: "highly confidential room", emoji_match: emoji },
      { name: `For Your Eyes Only ${emoji}`, vibe: "restricted access circle", emoji_match: emoji }
    ];
  }

  const fallback = {
    suggestions,
    best_pick: suggestions[0].name
  };

  return callGeminiWithRetry(prompt, fallback);
}

// ─────────────────────────────────────────────
// 5️⃣ Daily Vibe Summary (Notifications)
// ─────────────────────────────────────────────

/**
 * Generates a fun daily summary of user activity.
 */
async function generateDailySummary(activityData) {
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

  const fallback = {
    summary: `You had an awesome day on VibeSpace! You gained ${followersCount} new followers and were active in ${circlesActive} circle${circlesActive !== 1 ? 's' : ''}. Keep sharing your vibe!`,
    highlight: `Active engagement with your circles.`,
    motivation: `Every connection brings a new vibe. Keep shining! 🚀`,
    day_rating: "🔥 Lit Day"
  };

  return callGeminiWithRetry(prompt, fallback);
}

// ─────────────────────────────────────────────
// 6️⃣ Nearby Vibe Title Suggester
// ─────────────────────────────────────────────

/**
 * Generates catchy titles for nearby vibe bubbles.
 */
async function suggestVibeTitles(vibeEmoji, locationHint, timeOfDay, userTags) {
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

  const emoji = vibeEmoji || '📍';
  const fallback = {
    suggestions: [
      `Spontaneous Hangout ${emoji}`,
      `Chill Session ${emoji}`,
      `Vibe Check ${emoji}`,
      `Coffee & Chats ${emoji}`,
      `Nearby Hangout ${emoji}`
    ],
    best_match: `Spontaneous Hangout ${emoji}`
  };

  return callGeminiWithRetry(prompt, fallback);
}

module.exports = {
  generateCaption,
  suggestReplies,
  detectMood,
  generateCircleNames,
  generateDailySummary,
  suggestVibeTitles,
};
