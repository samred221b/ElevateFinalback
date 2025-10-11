const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Habit = require('../models/Habit');
const Category = require('../models/Category');
const Log = require('../models/Log');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('habits', 'name icon color isActive');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user stats
    await user.updateStats();

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting user profile'
    });
  }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark', 'system'])
    .withMessage('Theme must be light, dark, or system'),
  body('preferences.timezone')
    .optional()
    .isString()
    .withMessage('Timezone must be a string')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.id);
    const { name, email, avatar, preferences } = req.body;

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken'
        });
      }
      user.email = email;
    }

    // Update fields
    if (name) user.name = name;
    if (avatar !== undefined) user.avatar = avatar;
    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
    }

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
});

// @desc    Update user preferences
// @route   PUT /api/users/preferences
// @access  Private
router.put('/preferences', [
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'system'])
    .withMessage('Theme must be light, dark, or system'),
  body('notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notifications must be true or false'),
  body('notifications.push')
    .optional()
    .isBoolean()
    .withMessage('Push notifications must be true or false'),
  body('notifications.reminders')
    .optional()
    .isBoolean()
    .withMessage('Reminder notifications must be true or false'),
  body('timezone')
    .optional()
    .isString()
    .withMessage('Timezone must be a string')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.id);
    const { theme, notifications, timezone } = req.body;

    // Update preferences
    if (theme) user.preferences.theme = theme;
    if (notifications) {
      user.preferences.notifications = { 
        ...user.preferences.notifications, 
        ...notifications 
      };
    }
    if (timezone) user.preferences.timezone = timezone;

    await user.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: user.preferences
    });
  } catch (error) {
    console.error('Update user preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating preferences'
    });
  }
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    // Date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get basic counts
    const totalHabits = await Habit.countDocuments({ 
      user: userId, 
      isActive: true 
    });

    const totalCategories = await Category.countDocuments({ 
      user: userId 
    });

    const totalCompletions = await Log.countDocuments({
      user: userId,
      completed: true
    });

    const recentCompletions = await Log.countDocuments({
      user: userId,
      completed: true,
      date: { $gte: startDate, $lte: endDate }
    });

    // Get streak information
    const habits = await Habit.find({ user: userId, isActive: true });
    let totalCurrentStreak = 0;
    let longestStreak = 0;

    for (const habit of habits) {
      const streakInfo = await Log.getStreakInfo(habit._id);
      totalCurrentStreak += streakInfo.currentStreak;
      longestStreak = Math.max(longestStreak, streakInfo.longestStreak);
    }

    // Calculate consistency (days with at least one completion)
    const daysWithActivity = await Log.aggregate([
      {
        $match: {
          user: userId,
          completed: true,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
        }
      },
      { $count: "activeDays" }
    ]);

    const activeDays = daysWithActivity[0]?.activeDays || 0;
    const consistencyScore = Math.round((activeDays / parseInt(days)) * 100);

    // Get completion rate
    const possibleCompletions = totalHabits * parseInt(days);
    const completionRate = possibleCompletions > 0 
      ? Math.round((recentCompletions / possibleCompletions) * 100)
      : 0;

    // Update user stats in database
    const user = await User.findById(userId);
    user.stats = {
      totalHabits,
      totalCompletions,
      currentStreak: totalCurrentStreak,
      longestStreak: Math.max(user.stats.longestStreak || 0, longestStreak)
    };
    await user.save();

    res.json({
      success: true,
      data: {
        overview: {
          totalHabits,
          totalCategories,
          totalCompletions,
          recentCompletions,
          completionRate,
          consistencyScore,
          activeDays,
          period: parseInt(days)
        },
        streaks: {
          totalCurrentStreak,
          longestStreak,
          averageStreak: totalHabits > 0 ? Math.round(totalCurrentStreak / totalHabits) : 0
        }
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting user statistics'
    });
  }
});

// @desc    Get user activity feed
// @route   GET /api/users/activity
// @access  Private
router.get('/activity', async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const userId = req.user.id;

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build activity query based on type
    let activities = [];

    if (!type || type === 'completions') {
      // Get recent habit completions
      const completions = await Log.find({
        user: userId,
        completed: true
      })
      .populate('habit', 'name icon color category')
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

      activities = completions.map(log => ({
        type: 'completion',
        date: log.completedAt || log.createdAt,
        data: {
          habit: log.habit,
          value: log.value,
          unit: log.unit,
          mood: log.mood
        }
      }));
    }

    if (!type || type === 'habits') {
      // Get recently created habits
      const newHabits = await Habit.find({
        user: userId
      })
      .populate('category', 'name color icon')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

      const habitActivities = newHabits.map(habit => ({
        type: 'habit_created',
        date: habit.createdAt,
        data: {
          habit: {
            id: habit._id,
            name: habit.name,
            icon: habit.icon,
            color: habit.color,
            category: habit.category
          }
        }
      }));

      activities = activities.concat(habitActivities);
    }

    // Sort all activities by date
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Limit to requested amount
    activities = activities.slice(0, limitNum);

    res.json({
      success: true,
      count: activities.length,
      page: pageNum,
      data: activities
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting user activity'
    });
  }
});

// @desc    Export user data
// @route   GET /api/users/export
// @access  Private
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user data
    const user = await User.findById(userId).select('-password');
    const categories = await Category.find({ user: userId });
    const habits = await Habit.find({ user: userId })
      .populate('category', 'name color icon');
    const logs = await Log.find({ user: userId })
      .populate('habit', 'name icon color');

    const exportData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
        stats: user.stats,
        createdAt: user.createdAt
      },
      categories: categories.map(cat => ({
        id: cat._id,
        name: cat.name,
        description: cat.description,
        color: cat.color,
        icon: cat.icon,
        order: cat.order,
        createdAt: cat.createdAt
      })),
      habits: habits.map(habit => ({
        id: habit._id,
        name: habit.name,
        description: habit.description,
        icon: habit.icon,
        color: habit.color,
        category: habit.category,
        frequency: habit.frequency,
        difficulty: habit.difficulty,
        target: habit.target,
        reminder: habit.reminder,
        streak: habit.streak,
        stats: habit.stats,
        isActive: habit.isActive,
        createdAt: habit.createdAt
      })),
      logs: logs.map(log => ({
        id: log._id,
        habit: log.habit,
        date: log.date,
        completed: log.completed,
        value: log.value,
        unit: log.unit,
        notes: log.notes,
        mood: log.mood,
        difficulty: log.difficulty,
        createdAt: log.createdAt
      })),
      exportedAt: new Date(),
      version: '1.0'
    };

    res.json({
      success: true,
      message: 'Data exported successfully',
      data: exportData
    });
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error exporting user data'
    });
  }
});

// @desc    Delete user account
// @route   DELETE /api/users/account
// @access  Private
router.delete('/account', [
  body('password')
    .notEmpty()
    .withMessage('Password is required to delete account'),
  body('confirmation')
    .equals('DELETE')
    .withMessage('Please type DELETE to confirm account deletion')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { password } = req.body;
    const userId = req.user.id;

    // Get user with password
    const user = await User.findById(userId).select('+password');

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Delete all user data
    await Promise.all([
      Log.deleteMany({ user: userId }),
      Habit.deleteMany({ user: userId }),
      Category.deleteMany({ user: userId }),
      User.findByIdAndDelete(userId)
    ]);

    res.json({
      success: true,
      message: 'Account and all associated data deleted successfully'
    });
  } catch (error) {
    console.error('Delete user account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting account'
    });
  }
});

module.exports = router;
