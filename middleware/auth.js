const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - require authentication (with development bypass)
exports.protect = async (req, res, next) => {
  try {
    // Development bypass - create a test user if no auth token
    if (process.env.NODE_ENV === 'development') {
      let token;

      // Check for token in headers
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      }

      // If no token in development, create/use a test user
      if (!token) {
        console.log('🔧 Development mode: Using test user (no auth required)');
        
        // Try to find existing test user or create one
        let testUser = await User.findOne({ email: 'test@example.com' });
        
        if (!testUser) {
          console.log('🔧 Creating test user for development...');
          testUser = await User.create({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123', // This will be hashed by the model
            isActive: true
          });
          console.log('✅ Test user created successfully');
        }

        req.user = testUser;
        return next();
      }

      // If token exists, verify it normally
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Token is not valid. User not found.'
          });
        }

        if (!user.isActive) {
          return res.status(401).json({
            success: false,
            message: 'User account is deactivated.'
          });
        }

        req.user = user;
        next();
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Token is not valid.'
        });
      }
    } else {
      // Production mode - require proper authentication
      let token;

      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. No token provided.'
        });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Token is not valid. User not found.'
          });
        }

        if (!user.isActive) {
          return res.status(401).json({
            success: false,
            message: 'User account is deactivated.'
          });
        }

        req.user = user;
        next();
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Token is not valid.'
        });
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Grant access to specific roles (for future use)
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Optional auth - doesn't require token but adds user if present
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && user.isActive) {
          req.user = user;
        }
      } catch (error) {
        // Token invalid, but that's okay for optional auth
        console.log('Invalid token in optional auth:', error.message);
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue even if there's an error
  }
};
