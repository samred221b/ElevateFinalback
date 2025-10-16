const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    // Check if we have the service account credentials
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Parse the service account JSON from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      
      console.log('✅ Firebase Admin SDK initialized with service account');
    } else if (process.env.FIREBASE_PROJECT_ID) {
      // Use application default credentials (for local development)
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      
      console.log('✅ Firebase Admin SDK initialized with application default credentials');
    } else {
      console.warn('⚠️ Firebase Admin SDK not initialized - no credentials found');
    }
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin SDK:', error);
  }
}

// Middleware to verify Firebase ID token
exports.verifyFirebaseToken = async (req, res, next) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    
    console.log('🔐 Auth header received:', authHeader ? 'Bearer token present' : 'No token');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Development mode fallback
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Development mode: No Firebase token, using test user');
        req.user = { 
          id: 'test-user-firebase',
          uid: 'test-user-firebase',
          email: 'test@example.com'
        };
        return next();
      }
      
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    console.log('🔐 Token extracted, length:', token.length);

    // Check if Firebase Admin is initialized
    if (!admin.apps.length) {
      console.error('❌ Firebase Admin SDK not initialized!');
      // Development mode fallback
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Development mode: Firebase not initialized, using test user');
        req.user = { 
          id: 'test-user-firebase',
          uid: 'test-user-firebase',
          email: 'test@example.com'
        };
        return next();
      }
      
      return res.status(500).json({
        success: false,
        message: 'Firebase authentication not configured'
      });
    }

    try {
      // Verify the Firebase ID token
      console.log('🔐 Verifying Firebase token...');
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Add user info to request
      req.user = {
        id: decodedToken.uid,
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture
      };
      
      console.log('✅ Firebase token verified for user:', decodedToken.email, 'UID:', decodedToken.uid);
      console.log('🔐 Setting req.user.id to:', decodedToken.uid);
      next();
    } catch (error) {
      console.error('❌ Firebase token verification failed:', error.message);
      console.error('❌ Error code:', error.code);
      
      // Development mode fallback on token error
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Development mode: Token verification failed, using test user');
        req.user = { 
          id: 'test-user-firebase',
          uid: 'test-user-firebase',
          email: 'test@example.com'
        };
        return next();
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('❌ Error in Firebase auth middleware:', error);
    
    // Development mode fallback on error
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Auth error, using test user');
      req.user = { 
        id: 'test-user-firebase',
        uid: 'test-user-firebase',
        email: 'test@example.com'
      };
      return next();
    }
    
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Optional Firebase auth - doesn't require token but adds user if present
exports.optionalFirebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = {
          id: decodedToken.uid,
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture
        };
      } catch (error) {
        console.log('Optional auth: Invalid token, continuing without user');
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in optional Firebase auth:', error);
    next(); // Continue even if there's an error
  }
};
