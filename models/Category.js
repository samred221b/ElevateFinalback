const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a category name'],
    trim: true,
    maxlength: [30, 'Category name cannot be more than 30 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot be more than 200 characters']
  },
  color: {
    type: String,
    required: [true, 'Please provide a color'],
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color']
  },
  icon: {
    type: String,
    default: '📝'
  },
  user: {
    type: String,
    required: [true, 'Category must belong to a user']
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  stats: {
    totalHabits: {
      type: Number,
      default: 0
    },
    activeHabits: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for user and name uniqueness
categorySchema.index({ user: 1, name: 1 }, { unique: true });
categorySchema.index({ user: 1, order: 1 });

// Virtual for category's habits
categorySchema.virtual('habits', {
  ref: 'Habit',
  localField: '_id',
  foreignField: 'category'
});

// Update stats before saving
categorySchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('stats')) {
    // Stats will be updated by the updateStats method
  }
  next();
});

// Method to update category stats
categorySchema.methods.updateStats = async function() {
  const Habit = mongoose.model('Habit');
  const Log = mongoose.model('Log');
  
  try {
    // Count habits in this category
    const totalHabits = await Habit.countDocuments({ 
      category: this._id 
    });
    
    const activeHabits = await Habit.countDocuments({ 
      category: this._id, 
      isActive: true 
    });
    
    // Calculate completion rate for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const categoryHabits = await Habit.find({ 
      category: this._id, 
      isActive: true 
    }).select('_id');
    
    const habitIds = categoryHabits.map(h => h._id);
    
    if (habitIds.length > 0) {
      const totalPossibleCompletions = habitIds.length * 30; // 30 days
      const actualCompletions = await Log.countDocuments({
        habit: { $in: habitIds },
        completed: true,
        date: { $gte: thirtyDaysAgo }
      });
      
      const completionRate = totalPossibleCompletions > 0 
        ? Math.round((actualCompletions / totalPossibleCompletions) * 100)
        : 0;
      
      this.stats = {
        totalHabits,
        activeHabits,
        completionRate
      };
    } else {
      this.stats = {
        totalHabits: 0,
        activeHabits: 0,
        completionRate: 0
      };
    }
    
    await this.save();
  } catch (error) {
    console.error('Error updating category stats:', error);
  }
};

// Static method to get default categories for new users
categorySchema.statics.getDefaultCategories = function() {
  return [
    {
      name: 'Health & Fitness',
      description: 'Physical health, exercise, and wellness habits',
      color: '#10b981',
      icon: '💪',
      isDefault: true,
      order: 1
    },
    {
      name: 'Learning',
      description: 'Education, reading, and skill development',
      color: '#3b82f6',
      icon: '📚',
      isDefault: true,
      order: 2
    },
    {
      name: 'Productivity',
      description: 'Work, organization, and efficiency habits',
      color: '#8b5cf6',
      icon: '⚡',
      isDefault: true,
      order: 3
    },
    {
      name: 'Mindfulness',
      description: 'Mental health, meditation, and self-care',
      color: '#06b6d4',
      icon: '🧘',
      isDefault: true,
      order: 4
    },
    {
      name: 'Social',
      description: 'Relationships, communication, and social activities',
      color: '#f59e0b',
      icon: '👥',
      isDefault: true,
      order: 5
    }
  ];
};

module.exports = mongoose.model('Category', categorySchema);
