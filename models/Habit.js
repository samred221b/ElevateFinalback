const mongoose = require('mongoose');

const habitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a habit name'],
    trim: true,
    maxlength: [100, 'Habit name cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  icon: {
    type: String,
    default: '✅'
  },
  color: {
    type: String,
    required: [true, 'Please provide a color'],
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Habit must belong to a category']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Habit must belong to a user']
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily'
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  target: {
    type: {
      type: String,
      enum: ['boolean', 'number', 'duration'],
      default: 'boolean'
    },
    value: {
      type: Number,
      default: 1
    },
    unit: {
      type: String,
      default: 'times'
    }
  },
  reminder: {
    enabled: {
      type: Boolean,
      default: false
    },
    time: {
      type: String,
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide time in HH:MM format']
    },
    days: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }]
  },
  streak: {
    current: {
      type: Number,
      default: 0
    },
    longest: {
      type: Number,
      default: 0
    },
    lastCompletedDate: {
      type: Date,
      default: null
    }
  },
  stats: {
    totalCompletions: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    },
    averageValue: {
      type: Number,
      default: 0
    },
    bestStreak: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
habitSchema.index({ user: 1, isActive: 1 });
habitSchema.index({ category: 1 });
habitSchema.index({ user: 1, order: 1 });
habitSchema.index({ 'reminder.enabled': 1, 'reminder.time': 1 });

// Virtual for habit's logs
habitSchema.virtual('logs', {
  ref: 'Log',
  localField: '_id',
  foreignField: 'habit'
});

// Method to update habit stats
habitSchema.methods.updateStats = async function() {
  const Log = mongoose.model('Log');
  
  try {
    // Get all logs for this habit
    const logs = await Log.find({ habit: this._id }).sort({ date: -1 });
    
    // Calculate total completions
    const completedLogs = logs.filter(log => log.completed);
    const totalCompletions = completedLogs.length;
    
    // Calculate completion rate (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentLogs = logs.filter(log => new Date(log.date) >= thirtyDaysAgo);
    const recentCompletions = recentLogs.filter(log => log.completed).length;
    const completionRate = recentLogs.length > 0 
      ? Math.round((recentCompletions / recentLogs.length) * 100)
      : 0;
    
    // Calculate average value for number/duration targets
    let averageValue = 0;
    if (this.target.type !== 'boolean' && completedLogs.length > 0) {
      const totalValue = completedLogs.reduce((sum, log) => sum + (log.value || 0), 0);
      averageValue = Math.round((totalValue / completedLogs.length) * 100) / 100;
    }
    
    // Calculate current streak
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastCompletedDate = null;
    
    // Sort logs by date (most recent first)
    const sortedLogs = logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    for (let i = 0; i < sortedLogs.length; i++) {
      const log = sortedLogs[i];
      
      if (log.completed) {
        if (!lastCompletedDate) {
          lastCompletedDate = log.date;
        }
        
        tempStreak++;
        
        // If this is the most recent completion, start current streak
        if (i === 0 || this.isConsecutiveDay(sortedLogs[i-1].date, log.date)) {
          if (currentStreak === 0) currentStreak = tempStreak;
        }
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 0;
      }
    }
    
    longestStreak = Math.max(longestStreak, tempStreak);
    
    // Update habit stats
    this.stats = {
      totalCompletions,
      completionRate,
      averageValue,
      bestStreak: Math.max(this.stats.bestStreak || 0, longestStreak)
    };
    
    this.streak = {
      current: currentStreak,
      longest: Math.max(this.streak.longest || 0, longestStreak),
      lastCompletedDate
    };
    
    await this.save();
  } catch (error) {
    console.error('Error updating habit stats:', error);
  }
};

// Helper method to check if two dates are consecutive days
habitSchema.methods.isConsecutiveDay = function(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d1 - d2);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
};

// Method to check if habit should be completed today
habitSchema.methods.shouldCompleteToday = function() {
  const today = new Date();
  const dayOfWeek = today.toLocaleLowerCase().substring(0, 3); // mon, tue, etc.
  
  switch (this.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return this.reminder.days.includes(dayOfWeek);
    case 'monthly':
      return today.getDate() === 1; // First day of month
    default:
      return true;
  }
};

// Static method to get habit templates
habitSchema.statics.getTemplates = function() {
  return {
    'morning-routine': [
      { name: 'Drink water', icon: '💧', difficulty: 'easy' },
      { name: 'Morning meditation', icon: '🧘', difficulty: 'medium' },
      { name: 'Exercise', icon: '🏃', difficulty: 'medium' },
      { name: 'Healthy breakfast', icon: '🍎', difficulty: 'easy' },
      { name: 'Plan the day', icon: '📝', difficulty: 'easy' }
    ],
    'fitness-health': [
      { name: 'Workout', icon: '🏋️', difficulty: 'hard' },
      { name: 'Drink 8 glasses of water', icon: '💧', difficulty: 'easy' },
      { name: 'Take vitamins', icon: '💊', difficulty: 'easy' },
      { name: 'Track calories', icon: '🍽️', difficulty: 'medium' },
      { name: '10,000 steps', icon: '🚶', difficulty: 'medium' },
      { name: 'Stretch', icon: '🤸', difficulty: 'easy' }
    ],
    'productivity': [
      { name: 'Deep work session', icon: '💻', difficulty: 'hard' },
      { name: 'Review goals', icon: '🎯', difficulty: 'easy' },
      { name: 'Learn something new', icon: '📚', difficulty: 'medium' },
      { name: 'Inbox zero', icon: '📧', difficulty: 'medium' },
      { name: 'Plan tomorrow', icon: '📅', difficulty: 'easy' }
    ],
    'mindfulness': [
      { name: 'Meditation', icon: '🧘', difficulty: 'medium' },
      { name: 'Gratitude journal', icon: '📔', difficulty: 'easy' },
      { name: 'Deep breathing', icon: '🌬️', difficulty: 'easy' },
      { name: 'Digital detox hour', icon: '📵', difficulty: 'hard' },
      { name: 'Read for pleasure', icon: '📖', difficulty: 'easy' }
    ],
    'evening-routine': [
      { name: 'Review the day', icon: '📝', difficulty: 'easy' },
      { name: 'Prepare tomorrow\'s outfit', icon: '👔', difficulty: 'easy' },
      { name: 'Skincare routine', icon: '🧴', difficulty: 'easy' },
      { name: 'Read before bed', icon: '📚', difficulty: 'easy' },
      { name: 'No screens 1hr before bed', icon: '📵', difficulty: 'hard' },
      { name: 'Sleep by 10 PM', icon: '😴', difficulty: 'medium' }
    ],
    'creative': [
      { name: 'Write/Journal', icon: '✍️', difficulty: 'medium' },
      { name: 'Draw or sketch', icon: '🎨', difficulty: 'medium' },
      { name: 'Practice instrument', icon: '🎵', difficulty: 'hard' },
      { name: 'Creative reading', icon: '📚', difficulty: 'easy' },
      { name: 'Brainstorm ideas', icon: '💡', difficulty: 'easy' }
    ],
    'social': [
      { name: 'Call a friend/family', icon: '📞', difficulty: 'easy' },
      { name: 'Quality time with loved ones', icon: '👨‍👩‍👧', difficulty: 'medium' },
      { name: 'Send a thoughtful message', icon: '💌', difficulty: 'easy' },
      { name: 'Practice active listening', icon: '👂', difficulty: 'medium' },
      { name: 'Express gratitude', icon: '🙏', difficulty: 'easy' }
    ]
  };
};

module.exports = mongoose.model('Habit', habitSchema);
