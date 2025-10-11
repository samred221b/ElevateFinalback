const express = require('express');
const Log = require('../models/Log');
const Habit = require('../models/Habit');
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// @desc    Get dashboard analytics
// @route   GET /api/analytics/dashboard
// @access  Private
router.get('/dashboard', async (req, res) => {
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

    // Get completion stats for the period
    const completionStats = await Log.getCompletionStats(userId, parseInt(days));

    // Calculate average completion rate
    const avgCompletionRate = completionStats.length > 0
      ? Math.round(completionStats.reduce((sum, stat) => sum + stat.percentage, 0) / completionStats.length)
      : 0;

    // Get consistency (days with at least one completion)
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

    // Get top performing habits
    const topHabits = await Log.aggregate([
      {
        $match: {
          user: userId,
          completed: true,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$habit",
          completions: { $sum: 1 }
        }
      },
      { $sort: { completions: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "habits",
          localField: "_id",
          foreignField: "_id",
          as: "habit"
        }
      },
      { $unwind: "$habit" },
      {
        $project: {
          name: "$habit.name",
          icon: "$habit.icon",
          color: "$habit.color",
          completions: 1
        }
      }
    ]);

    // Get category performance
    const categoryStats = await Log.aggregate([
      {
        $match: {
          user: userId,
          completed: true,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: "habits",
          localField: "habit",
          foreignField: "_id",
          as: "habitInfo"
        }
      },
      { $unwind: "$habitInfo" },
      {
        $lookup: {
          from: "categories",
          localField: "habitInfo.category",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" },
      {
        $group: {
          _id: "$category._id",
          name: { $first: "$category.name" },
          color: { $first: "$category.color" },
          icon: { $first: "$category.icon" },
          completions: { $sum: 1 }
        }
      },
      { $sort: { completions: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalHabits,
          totalCategories,
          totalCompletions,
          avgCompletionRate,
          consistencyScore,
          activeDays,
          period: parseInt(days)
        },
        completionTrend: completionStats,
        topHabits,
        categoryPerformance: categoryStats
      }
    });
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting dashboard analytics'
    });
  }
});

// @desc    Get habit performance analytics
// @route   GET /api/analytics/habits
// @access  Private
router.get('/habits', async (req, res) => {
  try {
    const userId = req.user.id;
    const { habitId, days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    let matchQuery = {
      user: userId,
      date: { $gte: startDate, $lte: endDate }
    };

    if (habitId) {
      matchQuery.habit = habitId;
    }

    // Get daily completion data
    const dailyStats = await Log.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            habit: "$habit"
          },
          completed: { $max: "$completed" },
          value: { $max: "$value" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          totalHabits: { $sum: 1 },
          completedHabits: {
            $sum: { $cond: ["$completed", 1, 0] }
          },
          totalValue: { $sum: "$value" }
        }
      },
      {
        $project: {
          date: "$_id",
          totalHabits: 1,
          completedHabits: 1,
          completionRate: {
            $round: [
              { $multiply: [{ $divide: ["$completedHabits", "$totalHabits"] }, 100] },
              2
            ]
          },
          totalValue: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Get weekly patterns
    const weeklyPatterns = await Log.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            dayOfWeek: { $dayOfWeek: "$date" },
            habit: "$habit"
          },
          completed: { $max: "$completed" }
        }
      },
      {
        $group: {
          _id: "$_id.dayOfWeek",
          totalHabits: { $sum: 1 },
          completedHabits: {
            $sum: { $cond: ["$completed", 1, 0] }
          }
        }
      },
      {
        $project: {
          dayOfWeek: "$_id",
          completionRate: {
            $round: [
              { $multiply: [{ $divide: ["$completedHabits", "$totalHabits"] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { dayOfWeek: 1 } }
    ]);

    // Map day numbers to names
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = weeklyPatterns.map(pattern => ({
      day: dayNames[pattern.dayOfWeek - 1],
      completionRate: pattern.completionRate
    }));

    // Get habit streaks
    let habitStreaks = [];
    if (!habitId) {
      const habits = await Habit.find({ user: userId, isActive: true });
      habitStreaks = await Promise.all(
        habits.map(async (habit) => {
          const streakInfo = await Log.getStreakInfo(habit._id);
          return {
            habitId: habit._id,
            name: habit.name,
            icon: habit.icon,
            color: habit.color,
            currentStreak: streakInfo.currentStreak,
            longestStreak: streakInfo.longestStreak
          };
        })
      );
    }

    res.json({
      success: true,
      data: {
        dailyStats,
        weeklyPatterns: weeklyData,
        habitStreaks
      }
    });
  } catch (error) {
    console.error('Get habit analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting habit analytics'
    });
  }
});

// @desc    Get category analytics
// @route   GET /api/analytics/categories
// @access  Private
router.get('/categories', async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get category performance over time
    const categoryTrends = await Log.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: "habits",
          localField: "habit",
          foreignField: "_id",
          as: "habitInfo"
        }
      },
      { $unwind: "$habitInfo" },
      {
        $lookup: {
          from: "categories",
          localField: "habitInfo.category",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            category: "$category._id"
          },
          categoryName: { $first: "$category.name" },
          categoryColor: { $first: "$category.color" },
          totalLogs: { $sum: 1 },
          completedLogs: {
            $sum: { $cond: ["$completed", 1, 0] }
          }
        }
      },
      {
        $group: {
          _id: "$_id.category",
          categoryName: { $first: "$categoryName" },
          categoryColor: { $first: "$categoryColor" },
          dailyStats: {
            $push: {
              date: "$_id.date",
              totalLogs: "$totalLogs",
              completedLogs: "$completedLogs",
              completionRate: {
                $round: [
                  { $multiply: [{ $divide: ["$completedLogs", "$totalLogs"] }, 100] },
                  2
                ]
              }
            }
          },
          avgCompletionRate: {
            $avg: {
              $multiply: [{ $divide: ["$completedLogs", "$totalLogs"] }, 100]
            }
          }
        }
      },
      {
        $project: {
          categoryId: "$_id",
          categoryName: 1,
          categoryColor: 1,
          avgCompletionRate: { $round: ["$avgCompletionRate", 2] },
          dailyStats: 1
        }
      },
      { $sort: { avgCompletionRate: -1 } }
    ]);

    // Get category distribution
    const categoryDistribution = await Category.aggregate([
      { $match: { user: userId } },
      {
        $lookup: {
          from: "habits",
          localField: "_id",
          foreignField: "category",
          as: "habits"
        }
      },
      {
        $project: {
          name: 1,
          color: 1,
          icon: 1,
          habitCount: { $size: "$habits" },
          activeHabits: {
            $size: {
              $filter: {
                input: "$habits",
                cond: { $eq: ["$$this.isActive", true] }
              }
            }
          }
        }
      },
      { $sort: { habitCount: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        categoryTrends,
        categoryDistribution
      }
    });
  } catch (error) {
    console.error('Get category analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting category analytics'
    });
  }
});

// @desc    Get streak analytics
// @route   GET /api/analytics/streaks
// @access  Private
router.get('/streaks', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all active habits for the user
    const habits = await Habit.find({ 
      user: userId, 
      isActive: true 
    }).select('name icon color category');

    // Get streak information for each habit
    const streakData = await Promise.all(
      habits.map(async (habit) => {
        const streakInfo = await Log.getStreakInfo(habit._id);
        return {
          habit: {
            id: habit._id,
            name: habit.name,
            icon: habit.icon,
            color: habit.color
          },
          currentStreak: streakInfo.currentStreak,
          longestStreak: streakInfo.longestStreak,
          lastCompletedDate: streakInfo.lastCompletedDate
        };
      })
    );

    // Sort by current streak (descending)
    streakData.sort((a, b) => b.currentStreak - a.currentStreak);

    // Calculate streak statistics
    const totalStreaks = streakData.reduce((sum, data) => sum + data.currentStreak, 0);
    const avgStreak = streakData.length > 0 
      ? Math.round(totalStreaks / streakData.length) 
      : 0;
    const longestOverallStreak = Math.max(...streakData.map(data => data.longestStreak), 0);
    const activeStreaks = streakData.filter(data => data.currentStreak > 0).length;

    res.json({
      success: true,
      data: {
        overview: {
          totalHabits: habits.length,
          activeStreaks,
          avgStreak,
          longestOverallStreak
        },
        streakData
      }
    });
  } catch (error) {
    console.error('Get streak analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting streak analytics'
    });
  }
});

// @desc    Get mood analytics
// @route   GET /api/analytics/mood
// @access  Private
router.get('/mood', async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get mood distribution
    const moodStats = await Log.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: startDate, $lte: endDate },
          mood: { $ne: null }
        }
      },
      {
        $group: {
          _id: "$mood",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get mood trends over time
    const moodTrends = await Log.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: startDate, $lte: endDate },
          mood: { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            mood: "$mood"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          moods: {
            $push: {
              mood: "$_id.mood",
              count: "$count"
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get correlation between mood and completion
    const moodCompletion = await Log.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: startDate, $lte: endDate },
          mood: { $ne: null }
        }
      },
      {
        $group: {
          _id: "$mood",
          totalLogs: { $sum: 1 },
          completedLogs: {
            $sum: { $cond: ["$completed", 1, 0] }
          }
        }
      },
      {
        $project: {
          mood: "$_id",
          totalLogs: 1,
          completedLogs: 1,
          completionRate: {
            $round: [
              { $multiply: [{ $divide: ["$completedLogs", "$totalLogs"] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { completionRate: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        moodDistribution: moodStats,
        moodTrends,
        moodCompletion
      }
    });
  } catch (error) {
    console.error('Get mood analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting mood analytics'
    });
  }
});

module.exports = router;
