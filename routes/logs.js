const express = require('express');
const { body, validationResult } = require('express-validator');
const Log = require('../models/Log');
const Habit = require('../models/Habit');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// @desc    Get logs for user
// @route   GET /api/logs
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { 
      habit, 
      startDate, 
      endDate, 
      completed, 
      page = 1, 
      limit = 50 
    } = req.query;

    // Build query
    const query = { user: req.user.id };
    
    if (habit) query.habit = habit;
    if (completed !== undefined) query.completed = completed === 'true';
    
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get logs with pagination
    const logs = await Log.find(query)
      .populate('habit', 'name icon color category')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Log.countDocuments(query);

    res.json({
      success: true,
      count: logs.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: logs
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting logs'
    });
  }
});

// @desc    Get single log
// @route   GET /api/logs/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const log = await Log.findOne({
      _id: req.params.id,
      user: req.user.id
    }).populate('habit', 'name icon color category target');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Get log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting log'
    });
  }
});

// @desc    Create or update log
// @route   POST /api/logs
// @access  Private
router.post('/', [
  body('habit')
    .isMongoId()
    .withMessage('Valid habit ID is required'),
  body('date')
    .isISO8601()
    .withMessage('Valid date is required'),
  body('completed')
    .isBoolean()
    .withMessage('Completed must be true or false'),
  body('value')
    .optional()
    .isNumeric()
    .withMessage('Value must be a number'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot be more than 500 characters'),
  body('mood')
    .optional()
    .isIn(['very-bad', 'bad', 'neutral', 'good', 'excellent'])
    .withMessage('Invalid mood value'),
  body('difficulty')
    .optional()
    .isIn(['very-easy', 'easy', 'medium', 'hard', 'very-hard'])
    .withMessage('Invalid difficulty value')
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

    const {
      habit,
      date,
      completed,
      value,
      unit,
      notes,
      mood,
      difficulty
    } = req.body;

    // Verify habit belongs to user
    const habitDoc = await Habit.findOne({
      _id: habit,
      user: req.user.id
    });

    if (!habitDoc) {
      return res.status(400).json({
        success: false,
        message: 'Habit not found or does not belong to you'
      });
    }

    // Format date to start of day
    const logDate = new Date(date);
    logDate.setUTCHours(0, 0, 0, 0);

    // Check if log already exists for this habit and date
    let log = await Log.findOne({
      habit,
      user: req.user.id,
      date: logDate
    });

    if (log) {
      // Update existing log
      log.completed = completed;
      if (value !== undefined) log.value = value;
      if (unit !== undefined) log.unit = unit;
      if (notes !== undefined) log.notes = notes;
      if (mood !== undefined) log.mood = mood;
      if (difficulty !== undefined) log.difficulty = difficulty;
      
      await log.save();
    } else {
      // Create new log
      log = await Log.create({
        habit,
        user: req.user.id,
        date: logDate,
        completed,
        value,
        unit: unit || habitDoc.target.unit,
        notes,
        mood,
        difficulty
      });
    }

    // Populate habit info
    await log.populate('habit', 'name icon color category');

    res.status(log.isNew ? 201 : 200).json({
      success: true,
      message: log.isNew ? 'Log created successfully' : 'Log updated successfully',
      data: log
    });
  } catch (error) {
    console.error('Create/update log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating/updating log'
    });
  }
});

// @desc    Update log
// @route   PUT /api/logs/:id
// @access  Private
router.put('/:id', [
  body('completed')
    .optional()
    .isBoolean()
    .withMessage('Completed must be true or false'),
  body('value')
    .optional()
    .isNumeric()
    .withMessage('Value must be a number'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot be more than 500 characters'),
  body('mood')
    .optional()
    .isIn(['very-bad', 'bad', 'neutral', 'good', 'excellent'])
    .withMessage('Invalid mood value'),
  body('difficulty')
    .optional()
    .isIn(['very-easy', 'easy', 'medium', 'hard', 'very-hard'])
    .withMessage('Invalid difficulty value')
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

    const log = await Log.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    const {
      completed,
      value,
      unit,
      notes,
      mood,
      difficulty
    } = req.body;

    // Update fields
    if (completed !== undefined) log.completed = completed;
    if (value !== undefined) log.value = value;
    if (unit !== undefined) log.unit = unit;
    if (notes !== undefined) log.notes = notes;
    if (mood !== undefined) log.mood = mood;
    if (difficulty !== undefined) log.difficulty = difficulty;

    await log.save();
    await log.populate('habit', 'name icon color category');

    res.json({
      success: true,
      message: 'Log updated successfully',
      data: log
    });
  } catch (error) {
    console.error('Update log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating log'
    });
  }
});

// @desc    Delete log
// @route   DELETE /api/logs/:id
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const log = await Log.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    await Log.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Log deleted successfully'
    });
  } catch (error) {
    console.error('Delete log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting log'
    });
  }
});

// @desc    Get logs for date range
// @route   GET /api/logs/range
// @access  Private
router.get('/range/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const { habit } = req.query;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const logs = await Log.getLogsForDateRange(
      req.user.id,
      start,
      end,
      habit
    );

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('Get logs for date range error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting logs for date range'
    });
  }
});

// @desc    Get completion stats
// @route   GET /api/logs/stats/completion
// @access  Private
router.get('/stats/completion', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const stats = await Log.getCompletionStats(req.user.id, parseInt(days));

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get completion stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting completion statistics'
    });
  }
});

// @desc    Get streak information for habit
// @route   GET /api/logs/stats/streak/:habitId
// @access  Private
router.get('/stats/streak/:habitId', async (req, res) => {
  try {
    const { habitId } = req.params;

    // Verify habit belongs to user
    const habit = await Habit.findOne({
      _id: habitId,
      user: req.user.id
    });

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found'
      });
    }

    const streakInfo = await Log.getStreakInfo(habitId);

    res.json({
      success: true,
      data: streakInfo
    });
  } catch (error) {
    console.error('Get streak info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting streak information'
    });
  }
});

// @desc    Bulk create/update logs
// @route   POST /api/logs/bulk
// @access  Private
router.post('/bulk', [
  body('logs')
    .isArray({ min: 1 })
    .withMessage('Logs array is required'),
  body('logs.*.habit')
    .isMongoId()
    .withMessage('Valid habit ID is required'),
  body('logs.*.date')
    .isISO8601()
    .withMessage('Valid date is required'),
  body('logs.*.completed')
    .isBoolean()
    .withMessage('Completed must be true or false')
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

    const { logs } = req.body;

    // Verify all habits belong to user
    const habitIds = [...new Set(logs.map(log => log.habit))];
    const userHabits = await Habit.find({
      _id: { $in: habitIds },
      user: req.user.id
    });

    if (userHabits.length !== habitIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more habits not found or do not belong to you'
      });
    }

    const results = [];
    
    // Process each log
    for (const logData of logs) {
      const {
        habit,
        date,
        completed,
        value,
        unit,
        notes,
        mood,
        difficulty
      } = logData;

      // Format date
      const logDate = new Date(date);
      logDate.setUTCHours(0, 0, 0, 0);

      // Find or create log
      let log = await Log.findOne({
        habit,
        user: req.user.id,
        date: logDate
      });

      if (log) {
        // Update existing
        log.completed = completed;
        if (value !== undefined) log.value = value;
        if (unit !== undefined) log.unit = unit;
        if (notes !== undefined) log.notes = notes;
        if (mood !== undefined) log.mood = mood;
        if (difficulty !== undefined) log.difficulty = difficulty;
        
        await log.save();
        results.push({ action: 'updated', log });
      } else {
        // Create new
        log = await Log.create({
          habit,
          user: req.user.id,
          date: logDate,
          completed,
          value,
          unit,
          notes,
          mood,
          difficulty
        });
        results.push({ action: 'created', log });
      }
    }

    res.json({
      success: true,
      message: `Bulk operation completed: ${results.filter(r => r.action === 'created').length} created, ${results.filter(r => r.action === 'updated').length} updated`,
      data: results
    });
  } catch (error) {
    console.error('Bulk logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing bulk logs'
    });
  }
});

module.exports = router;
