const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  avatar: {
    type: String,
    default: null
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      reminders: {
        type: Boolean,
        default: true
      }
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  stats: {
    totalHabits: {
      type: Number,
      default: 0
    },
    totalCompletions: {
      type: Number,
      default: 0
    },
    currentStreak: {
      type: Number,
      default: 0
    },
    longestStreak: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCode: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  passwordResetCode: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
userSchema.index({ createdAt: -1 });

// Virtual for user's habits
userSchema.virtual('habits', {
  ref: 'Habit',
  localField: '_id',
  foreignField: 'user'
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update lastLogin on login
userSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('lastLogin')) {
    this.lastLogin = new Date();
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      email: this.email 
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE 
    }
  );
};

// Update user stats
userSchema.methods.updateStats = async function() {
  const Habit = mongoose.model('Habit');
  const Log = mongoose.model('Log');
  
  try {
    // Count total habits
    const totalHabits = await Habit.countDocuments({ user: this._id, isActive: true });
    
    // Count total completions
    const totalCompletions = await Log.countDocuments({ 
      user: this._id, 
      completed: true 
    });
    
    // Calculate current streak (simplified - you might want more complex logic)
    const recentLogs = await Log.find({ 
      user: this._id, 
      completed: true 
    })
    .sort({ date: -1 })
    .limit(30);
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    // Calculate streaks (this is a simplified version)
    for (let i = 0; i < recentLogs.length; i++) {
      if (i === 0 || 
          new Date(recentLogs[i-1].date).getTime() - new Date(recentLogs[i].date).getTime() === 86400000) {
        tempStreak++;
        if (i === 0) currentStreak = tempStreak;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    
    // Update stats
    this.stats = {
      totalHabits,
      totalCompletions,
      currentStreak,
      longestStreak: Math.max(this.stats.longestStreak, longestStreak)
    };
    
    await this.save();
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
};

// Generate email verification code
userSchema.methods.generateEmailVerificationCode = function() {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Set code and expiration (15 minutes from now)
  this.emailVerificationCode = code;
  this.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
  
  return code;
};

// Verify email verification code
userSchema.methods.verifyEmailCode = function(code) {
  if (!this.emailVerificationCode || !this.emailVerificationExpires) {
    return false;
  }
  
  // Check if code matches and hasn't expired
  if (this.emailVerificationCode === code && this.emailVerificationExpires > new Date()) {
    this.isEmailVerified = true;
    this.emailVerificationCode = null;
    this.emailVerificationExpires = null;
    return true;
  }
  
  return false;
};

// Generate password reset code
userSchema.methods.generatePasswordResetCode = function() {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Set code and expiration (15 minutes from now)
  this.passwordResetCode = code;
  this.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
  
  return code;
};

// Verify password reset code
userSchema.methods.verifyPasswordResetCode = function(code) {
  if (!this.passwordResetCode || !this.passwordResetExpires) {
    return false;
  }
  
  // Check if code matches and hasn't expired
  if (this.passwordResetCode === code && this.passwordResetExpires > new Date()) {
    return true;
  }
  
  return false;
};

// Reset password with code
userSchema.methods.resetPassword = function(newPassword) {
  this.password = newPassword;
  this.passwordResetCode = null;
  this.passwordResetExpires = null;
};

module.exports = mongoose.model('User', userSchema);
