const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging
app.use(morgan('combined'));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all localhost and local network origins
    if (process.env.NODE_ENV === 'development') {
      // Allow localhost
      if (origin.includes('localhost')) {
        return callback(null, true);
      }
      // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (origin.match(/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/)) {
        return callback(null, true);
      }
    }
    
    // Allow specific origins
    const allowedOrigins = [
      'http://localhost:5174',
      'http://localhost:5173', 
      'http://localhost:5175',
      'http://localhost:3000',
      process.env.FRONTEND_URL,
      process.env.CORS_ORIGIN,
      'https://habit-tracker-frontend.onrender.com',
      'https://elevate2-production.up.railway.app', // Old Railway frontend domain
      'https://elevatefinalfront-production.up.railway.app' // Current Railway frontend domain
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('⚠️ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection with improved timeout and fallback
const connectDB = async () => {
  const atlasUri = process.env.MONGODB_URI;
  const localUri = 'mongodb://localhost:27017/habit-tracker-local';
  
  // Set mongoose connection options
  const mongooseOptions = {
    serverSelectionTimeoutMS: 10000, // 10 second timeout
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority'
  };
  
  if (atlasUri) {
    try {
      console.log('🔄 Attempting to connect to MongoDB Atlas...');
      console.log('📍 Atlas URI:', atlasUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
      
      await mongoose.connect(atlasUri, mongooseOptions);
      console.log('✅ Connected to MongoDB Atlas successfully');
      
      // Test the connection
      await mongoose.connection.db.admin().ping();
      console.log('🏓 MongoDB Atlas ping successful');
      return;
    } catch (error) {
      console.warn('⚠️ MongoDB Atlas connection failed:', error.message);
      if (error.message.includes('ETIMEOUT')) {
        console.log('🌐 Network timeout - check your internet connection');
      }
      console.log('🔄 Falling back to local MongoDB...');
    }
  }
  
  try {
    console.log('🔄 Attempting to connect to local MongoDB...');
    await mongoose.connect(localUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log('✅ Connected to local MongoDB successfully');
    
    // Test the connection
    await mongoose.connection.db.admin().ping();
    console.log('🏓 Local MongoDB ping successful');
  } catch (error) {
    console.warn('⚠️ Local MongoDB also failed:', error.message);
    console.log('💡 Continuing without database - using mock data for development');
    console.log('🔧 To fix: Install MongoDB locally or check Atlas connection');
    // Don't exit, continue with mock data
  }
};

connectDB();

// Routes (Firebase auth - no backend auth needed)
// app.use('/api/auth', require('./routes/auth')); // Removed - using Firebase
// app.use('/api/users', require('./routes/users')); // Removed - using Firebase
app.use('/api/categories', require('./routes/categories'));
app.use('/api/habits', require('./routes/habits'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/analytics', require('./routes/analytics'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Habit Tracker API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Local access: http://localhost:${PORT}/api/health`);
  console.log(`📱 Network access: http://[YOUR_IP]:${PORT}/api/health`);
  console.log(`💡 Replace [YOUR_IP] with your computer's IP address for mobile access`);
});

module.exports = app;
