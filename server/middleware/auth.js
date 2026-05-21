const admin = require('firebase-admin');

let firebaseAdminInitialized = false;
try {
  if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID
    });
    firebaseAdminInitialized = true;
    console.log("Firebase Admin initialized successfully.");
  }
} catch (e) {
  console.warn("Firebase Admin failed to initialize. Using signatureless dev auth: ", e.message);
}

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split('Bearer ')[1];

    if (firebaseAdminInitialized) {
      // Fallback for development if token is just the UID
      if (token && token.length < 100) {
        req.user = { uid: token };
        return next();
      }
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = { uid: decodedToken.uid };
        return next();
      } catch (err) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
      }
    } else {
      // In development fallback, treat Bearer token as UID directly
      req.user = { uid: token };
      return next();
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
