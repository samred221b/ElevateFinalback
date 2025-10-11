const express = require('express');
const { body, validationResult } = require('express-validator');
const Habit = require('../models/Habit');
const Category = require('../models/Category');
const Log = require('../models/Log');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// @desc    Get all habits for user
// @route   GET /api/habits
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { category, active, frequency } = req.query;
    
    // Build query
    const query = { user: req.user.id };
    
    if (category) query.category = category;
    if (active !== undefined) query.isActive = active === 'true';
    if (frequency) query.frequency = frequency;

    const habits = await Habit.find(query)
      .populate('category', 'name color icon')
      .sort({ order: 1, createdAt: 1 });

    res.json({
      success: true,
      count: habits.length,
      data: habits
    });
  } catch (error) {
    console.error('Get habits error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting habits'
    });
  }
});

// @desc    Get single habit
// @route   GET /api/habits/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user.id
    }).populate('category', 'name color icon');

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found'
      });
    }

    // Get recent logs for this habit
    const logs = await Log.find({ habit: req.params.id })
      .sort({ date: -1 })
      .limit(30);

    res.json({
      success: true,
      data: {
        habit,
        recentLogs: logs
      }
    });
  } catch (error) {
    console.error('Get habit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting habit'
    });
  }
});

// @desc    Create new habit
// @route   POST /api/habits
// @access  Private
router.post('/', [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Habit name must be between 1 and 100 characters'),
  body('category')
    .isMongoId()
    .withMessage('Valid category ID is required'),
  body('color')
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Please provide a valid hex color'),
  body('frequency')
    .optional()
    .isIn(['daily', 'weekly', 'monthly'])
    .withMessage('Frequency must be daily, weekly, or monthly'),
  body('difficulty')
    .optional()
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be easy, medium, or hard'),
  body('target.type')
    .optional()
    .isIn(['boolean', 'number', 'duration'])
    .withMessage('Target type must be boolean, number, or duration'),
  body('target.value')
    .optional()
    .isNumeric()
    .withMessage('Target value must be a number'),
  body('reminder.time')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Reminder time must be in HH:MM format')
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
      name,
      description,
      icon,
      color,
      category,
      frequency,
      difficulty,
      target,
      reminder,
      order
    } = req.body;

    // Verify category belongs to user
    const categoryDoc = await Category.findOne({
      _id: category,
      user: req.user.id
    });

    if (!categoryDoc) {
      return res.status(400).json({
        success: false,
        message: 'Category not found or does not belong to you'
      });
    }

    // Get the next order number if not provided
    let habitOrder = order;
    if (habitOrder === undefined) {
      const lastHabit = await Habit.findOne({ user: req.user.id })
        .sort({ order: -1 });
      habitOrder = lastHabit ? lastHabit.order + 1 : 1;
    }

    const habit = await Habit.create({
      name,
      description,
      icon: icon || '✅',
      color,
      category,
      user: req.user.id,
      frequency: frequency || 'daily',
      difficulty: difficulty || 'medium',
      target: target || { type: 'boolean', value: 1, unit: 'times' },
      reminder: reminder || { enabled: false },
      order: habitOrder
    });

    // Populate category info
    await habit.populate('category', 'name color icon');

    // Update category stats
    await categoryDoc.updateStats();

    res.status(201).json({
      success: true,
      message: 'Habit created successfully',
      data: habit
    });
  } catch (error) {
    console.error('Create habit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating habit'
    });
  }
});

// @desc    Update habit
// @route   PUT /api/habits/:id
// @access  Private
router.put('/:id', [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Habit name must be between 1 and 100 characters'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Valid category ID is required'),
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Please provide a valid hex color'),
  body('frequency')
    .optional()
    .isIn(['daily', 'weekly', 'monthly'])
    .withMessage('Frequency must be daily, weekly, or monthly'),
  body('difficulty')
    .optional()
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be easy, medium, or hard'),
  body('reminder.time')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Reminder time must be in HH:MM format')
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

    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found'
      });
    }

    const {
      name,
      description,
      icon,
      color,
      category,
      frequency,
      difficulty,
      target,
      reminder,
      isActive,
      order
    } = req.body;

    // If category is being changed, verify new category belongs to user
    if (category && category !== habit.category.toString()) {
      const categoryDoc = await Category.findOne({
        _id: category,
        user: req.user.id
      });

      if (!categoryDoc) {
        return res.status(400).json({
          success: false,
          message: 'Category not found or does not belong to you'
        });
      }
    }

    // Update fields
    if (name !== undefined) habit.name = name;
    if (description !== undefined) habit.description = description;
    if (icon !== undefined) habit.icon = icon;
    if (color !== undefined) habit.color = color;
    if (category !== undefined) habit.category = category;
    if (frequency !== undefined) habit.frequency = frequency;
    if (difficulty !== undefined) habit.difficulty = difficulty;
    if (target !== undefined) habit.target = { ...habit.target, ...target };
    if (reminder !== undefined) habit.reminder = { ...habit.reminder, ...reminder };
    if (isActive !== undefined) habit.isActive = isActive;
    if (order !== undefined) habit.order = order;

    await habit.save();
    await habit.populate('category', 'name color icon');
    await habit.updateStats();

    res.json({
      success: true,
      message: 'Habit updated successfully',
      data: habit
    });
  } catch (error) {
    console.error('Update habit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating habit'
    });
  }
});

// @desc    Delete habit
// @route   DELETE /api/habits/:id
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found'
      });
    }

    // Delete all logs associated with this habit
    await Log.deleteMany({ habit: req.params.id });

    // Delete the habit
    await Habit.findByIdAndDelete(req.params.id);

    // Update category stats
    const category = await Category.findById(habit.category);
    if (category) {
      await category.updateStats();
    }

    res.json({
      success: true,
      message: 'Habit and associated logs deleted successfully'
    });
  } catch (error) {
    console.error('Delete habit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting habit'
    });
  }
});

// @desc    Get habit templates
// @route   GET /api/habits/templates
// @access  Private
router.get('/templates/list', async (req, res) => {
  try {
    const templates = Habit.getTemplates();
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get habit templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting habit templates'
    });
  }
});

// @desc    Create habits from template
// @route   POST /api/habits/templates/:templateId
// @access  Private
router.post('/templates/:templateId', [
  body('categoryId')
    .isMongoId()
    .withMessage('Valid category ID is required')
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

    const { templateId } = req.params;
    const { categoryId } = req.body;

    // Verify category belongs to user
    const category = await Category.findOne({
      _id: categoryId,
      user: req.user.id
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category not found or does not belong to you'
      });
    }

    // Get template habits
    const templates = Habit.getTemplates();
    const templateHabits = templates[templateId];

    if (!templateHabits) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Get next order number
    const lastHabit = await Habit.findOne({ user: req.user.id })
      .sort({ order: -1 });
    let nextOrder = lastHabit ? lastHabit.order + 1 : 1;

    // Create habits from template
    const createdHabits = [];
    for (const template of templateHabits) {
      const habit = await Habit.create({
        name: template.name,
        icon: template.icon,
        color: category.color, // Use category color
        category: categoryId,
        user: req.user.id,
        difficulty: template.difficulty || 'medium',
        target: template.target || { type: 'boolean', value: 1, unit: 'times' },
        order: nextOrder++
      });

      await habit.populate('category', 'name color icon');
      createdHabits.push(habit);
    }

    // Update category stats
    await category.updateStats();

    res.status(201).json({
      success: true,
      message: `${createdHabits.length} habits created from template`,
      data: createdHabits
    });
  } catch (error) {
    console.error('Create habits from template error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating habits from template'
    });
  }
});

// @desc    Reorder habits
// @route   PUT /api/habits/reorder
// @access  Private
router.put('/reorder', [
  body('habits')
    .isArray({ min: 1 })
    .withMessage('Habits array is required'),
  body('habits.*.id')
    .isMongoId()
    .withMessage('Valid habit ID is required'),
  body('habits.*.order')
    .isInt({ min: 0 })
    .withMessage('Order must be a non-negative integer')
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

    const { habits } = req.body;

    // Verify all habits belong to the user
    const habitIds = habits.map(habit => habit.id);
    const userHabits = await Habit.find({
      _id: { $in: habitIds },
      user: req.user.id
    });

    if (userHabits.length !== habits.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more habits not found or do not belong to you'
      });
    }

    // Update order for each habit
    const updatePromises = habits.map(habit =>
      Habit.findByIdAndUpdate(habit.id, { order: habit.order }, { new: true })
    );

    const updatedHabits = await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Habits reordered successfully',
      data: updatedHabits
    });
  } catch (error) {
    console.error('Reorder habits error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error reordering habits'
    });
  }
});

// @desc    Get habit statistics
// @route   GET /api/habits/:id/stats
// @access  Private
router.get('/:id/stats', async (req, res) => {
  try {
    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user.id
    }).populate('category', 'name color icon');

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found'
      });
    }

    // Update stats before returning
    await habit.updateStats();

    // Get streak information
    const streakInfo = await Log.getStreakInfo(req.params.id);

    // Get completion stats for last 30 days
    const completionStats = await Log.getCompletionStats(req.user.id, 30);

    res.json({
      success: true,
      data: {
        habit: {
          id: habit._id,
          name: habit.name,
          icon: habit.icon,
          color: habit.color,
          category: habit.category,
          stats: habit.stats,
          streak: habit.streak
        },
        streakInfo,
        completionStats: completionStats.filter(stat => 
          // Filter to only this habit's data (this is simplified)
          true // You might want to implement habit-specific filtering
        )
      }
    });
  } catch (error) {
    console.error('Get habit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting habit statistics'
    });
  }
});

module.exports = router;
