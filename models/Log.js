const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  habit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Habit',
    required: [true, 'Log must belong to a habit']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Log must belong to a user']
  },
  date: {
    type: Date,
    required: [true, 'Please provide a date'],
    default: Date.now
  },
  completed: {
    type: Boolean,
    default: false
  },
  value: {
    type: Number,
    default: null // For number/duration targets
  },
  unit: {
    type: String,
    default: null // For number/duration targets
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  mood: {
    type: String,
    enum: ['very-bad', 'bad', 'neutral', 'good', 'excellent'],
    default: null
  },
  difficulty: {
    type: String,
    enum: ['very-easy', 'easy', 'medium', 'hard', 'very-hard'],
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  streak: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for unique habit-date combination
logSchema.index({ habit: 1, date: 1 }, { unique: true });
logSchema.index({ user: 1, date: -1 });
logSchema.index({ user: 1, completed: 1 });
logSchema.index({ habit: 1, completed: 1, date: -1 });

// Format date to YYYY-MM-DD before saving
logSchema.pre('save', function(next) {
  if (this.date) {
    // Ensure date is stored as start of day in UTC
    const date = new Date(this.date);
    date.setUTCHours(0, 0, 0, 0);
    this.date = date;
  }
  
  // Set completedAt when marking as completed
  if (this.completed && !this.completedAt) {
    this.completedAt = new Date();
  } else if (!this.completed) {
    this.completedAt = null;
  }
  
  next();
});

// Update habit stats after saving
logSchema.post('save', async function() {
  try {
    const Habit = mongoose.model('Habit');
    const habit = await Habit.findById(this.habit);
    if (habit) {
      await habit.updateStats();
    }
  } catch (error) {
    console.error('Error updating habit stats after log save:', error);
  }
});

// Update habit stats after deletion
logSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    try {
      const Habit = mongoose.model('Habit');
      const habit = await Habit.findById(doc.habit);
      if (habit) {
        await habit.updateStats();
      }
    } catch (error) {
      console.error('Error updating habit stats after log deletion:', error);
    }
  }
});

// Static method to get logs for a date range
logSchema.statics.getLogsForDateRange = async function(userId, startDate, endDate, habitId = null) {
  const query = {
    user: userId,
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };
  
  if (habitId) {
    query.habit = habitId;
  }
  
  return await this.find(query)
    .populate('habit', 'name icon color category')
    .sort({ date: -1 });
};

// Static method to get completion stats for a user
logSchema.statics.getCompletionStats = async function(userId, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const pipeline = [
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          completed: "$completed"
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: "$_id.date",
        total: { $sum: "$count" },
        completed: {
          $sum: {
            $cond: [{ $eq: ["$_id.completed", true] }, "$count", 0]
          }
        }
      }
    },
    {
      $project: {
        date: "$_id",
        total: 1,
        completed: 1,
        percentage: {
          $round: [
            { $multiply: [{ $divide: ["$completed", "$total"] }, 100] },
            2
          ]
        }
      }
    },
    { $sort: { date: 1 } }
  ];
  
  return await this.aggregate(pipeline);
};

// Static method to get streak information
logSchema.statics.getStreakInfo = async function(habitId) {
  const logs = await this.find({ habit: habitId })
    .sort({ date: -1 })
    .limit(365); // Last year
  
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastCompletedDate = null;
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    
    if (log.completed) {
      if (!lastCompletedDate) {
        lastCompletedDate = log.date;
      }
      
      tempStreak++;
      
      // Check if this is part of current streak (from today backwards)
      if (i === 0) {
        currentStreak = tempStreak;
      } else {
        const prevDate = new Date(logs[i-1].date);
        const currDate = new Date(log.date);
        const diffDays = Math.abs(prevDate - currDate) / (1000 * 60 * 60 * 24);
        
        if (diffDays === 1) {
          if (currentStreak === 0) currentStreak = tempStreak;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
          currentStreak = 0;
        }
      }
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 0;
      currentStreak = 0;
    }
  }
  
  longestStreak = Math.max(longestStreak, tempStreak);
  
  return {
    currentStreak,
    longestStreak,
    lastCompletedDate
  };
};

module.exports = mongoose.model('Log', logSchema);
