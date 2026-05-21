# VibeSpace

VibeSpace is a premium mobile social media + messaging app built with React Native and Expo. It combines features similar to Instagram and WhatsApp, featuring a unique **Circles** system (Friends, Family, Work, Secret) for targeted content sharing, real-time disappearing DMs, nearby map vibes, and custom animations.

## Tech Stack
- **Framework**: React Native with Expo SDK 54
- **Database & Storage**: Firebase (Auth, Firestore, Cloud Storage)
- **State Management**: Redux Toolkit + Redux Persist (offline-first sync for auth/user slices)
- **Routing & Navigation**: React Navigation v6
- **Styling**: Vanilla React Native StyleSheet with HSL-tailored colors, smooth gradients, and custom shadows for a premium glow aesthetic.

---

## Folder Structure

The project has been structured cleanly for scale and separation of concerns:

```text
vibe-space/
├── assets/                  # App icon, splash screen, and media assets
├── src/
│   ├── components/          # Reusable components
│   │   ├── common/          # Atomic components (Button, Input, Avatar, Badge, Loader, EmptyState)
│   │   └── screens/         # Screen-specific sub-components
│   ├── constants/           # Global themes, colors, screen names, and config items
│   │   ├── theme.js         # Color tokens, fonts, spacing, styles, and glow effects
│   │   └── index.js         # Navigation screen names, circle configuration, reactions
│   ├── navigation/          # React Navigation stacks and tab bar setup
│   │   ├── index.js         # Root app navigator with conditional authentication routes
│   │   ├── AuthNavigator.js # Logins, OTP Verification, Profile Creation
│   │   ├── MainNavigator.js # Styled tab navigator (Custom center button with gradient/glow)
│   │   └── HomeStack.js     # Detail screen flows (Feed, Post Details, Circle Settings)
│   ├── screens/             # UI Screen placeholders (auth, feed, chat, circles, profile, settings)
│   ├── services/            # API & Firebase service layers
│   │   ├── firebase.js      # Core Firebase client instantiation
│   │   ├── authService.js   # Phone authentication, OTP, and user profile sync
│   │   ├── postService.js   # Circle-based posts, comments, likes, reactions, and bucket cleanup
│   │   ├── chatService.js   # Real-time chat messaging with client-side expiration
│   │   ├── circleService.js # Circle definition and membership handling
│   │   ├── storageService.js# Cloud Storage helpers for profile photos and video attachments
│   │   └── locationService.js# Geospatial nearby coordinate calculations
│   ├── store/               # Redux state management
│   │   ├── index.js         # Redux Store wrapper with persisted storage configuration
│   │   └── slices/          # Feature slices (auth, user, post, chat, circle)
│   └── utils/               # Reusable helper functions
│       └── helpers.js       # Formatting, date utilities, and validations
├── App.js                   # Application root entry point
├── app.json                 # Expo configurations
├── babel.config.js          # Babel config (configured with react-native-dotenv)
├── firestore.rules          # Standard security rules for Firestore databases
└── package.json             # NPM dependencies
```

---

## Installation & Setup

### 1. Prerequisites
Ensure you have Node.js (v18+) and npm installed. For mobile testing, download the **Expo Go** app on iOS or Android.

### 2. Install Dependencies
Run the following command in the project root folder to install all packages:
```bash
npm install
```

### 3. Firebase Setup
1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Phone method), **Cloud Firestore**, and **Firebase Storage**.
3. Create a Web App within your Firebase project to get the credentials block.
4. Copy the environment template file:
   ```bash
   cp .env.template .env
   ```
5. Open `.env` and fill in your Firebase configuration keys:
   ```env
   FIREBASE_API_KEY=your_key_here
   FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   ...
   ```

### 4. Firestore Security Rules
To apply firestore database constraints, deploy or paste the contents of `firestore.rules` into your Firebase Console Firestore Rules tab.

---

## Running the App

Start the Expo Development Server:
```bash
npm start
```
or
```bash
npx expo start
```

### Run on Devices
- **Physical Device**: Scan the QR code printed in the terminal/console using your phone's camera (iOS) or the Expo Go app (Android). Make sure your computer and phone are on the same Wi-Fi network.
- **Android Emulator**: Press `a` in the terminal (requires Android Studio and a running emulator).
- **iOS Simulator**: Press `i` in the terminal (requires macOS and Xcode command-line tools).
