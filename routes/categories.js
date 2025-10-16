const express = require('express');
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const Habit = require('../models/Habit');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');

const router = express.Router();

// Apply Firebase authentication to all routes
router.use(verifyFirebaseToken);

// @desc    Get all categories for user
// @route   GET /api/categories
// @access  Private
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ user: req.user.id })
      .populate('habits', 'name icon color isActive')
      .sort({ order: 1, createdAt: 1 });

    res.json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting categories'
    });
  }
});

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user: req.user.id
    }).populate('habits', 'name icon color isActive streak stats');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting category'
    });
  }
});

// @desc    Create new category
// @route   POST /api/categories
// @access  Private
router.post('/', [
  body('name')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Category name must be between 1 and 30 characters'),
  body('color')
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Please provide a valid hex color'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description cannot be more than 200 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Icon must be between 1 and 10 characters')
], async (req, res) => {
  try {
    console.log('📝 Creating category - User ID:', req.user.id);
    console.log('📝 Request body:', req.body);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, color, icon, order } = req.body;

    // Check if category name already exists for this user
    console.log('🔍 Checking for existing category...');
    const existingCategory = await Category.findOne({
      user: req.user.id,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingCategory) {
      console.log('⚠️ Category already exists:', name);
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    // Get the next order number if not provided
    let categoryOrder = order;
    if (categoryOrder === undefined) {
      const lastCategory = await Category.findOne({ user: req.user.id })
        .sort({ order: -1 });
      categoryOrder = lastCategory ? lastCategory.order + 1 : 1;
    }

    console.log('✅ Creating category with data:', {
      name,
      description,
      color,
      icon: icon || '📝',
      user: req.user.id,
      order: categoryOrder
    });

    const category = await Category.create({
      name,
      description,
      color,
      icon: icon || '📝',
      user: req.user.id,
      order: categoryOrder
    });

    console.log('✅ Category created successfully:', category._id);

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    console.error('❌ Create category error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error creating category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private
router.put('/:id', [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Category name must be between 1 and 30 characters'),
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Please provide a valid hex color'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description cannot be more than 200 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Icon must be between 1 and 10 characters')
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

    const { name, description, color, icon, order } = req.body;

    const category = await Category.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if new name conflicts with existing category
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({
        user: req.user.id,
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }
    }

    // Update fields
    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (color !== undefined) category.color = color;
    if (icon !== undefined) category.icon = icon;
    if (order !== undefined) category.order = order;

    await category.save();
    await category.updateStats();

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating category'
    });
  }
});

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Delete all habits in this category first
    const habitsCount = await Habit.countDocuments({ category: req.params.id });
    
    if (habitsCount > 0) {
      // Get all habit IDs in this category
      const habits = await Habit.find({ category: req.params.id }).select('_id');
      const habitIds = habits.map(habit => habit._id);
      
      // Delete all logs for these habits
      const Log = require('../models/Log');
      await Log.deleteMany({ habit: { $in: habitIds } });
      
      // Delete the habits
      await Habit.deleteMany({ category: req.params.id });
    }

    // Delete the category
    await Category.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: habitsCount > 0 
        ? `Category and ${habitsCount} habit(s) deleted successfully`
        : 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting category'
    });
  }
});

// @desc    Reorder categories
// @route   PUT /api/categories/reorder
// @access  Private
router.put('/reorder', [
  body('categories')
    .isArray({ min: 1 })
    .withMessage('Categories array is required'),
  body('categories.*.id')
    .isMongoId()
    .withMessage('Valid category ID is required'),
  body('categories.*.order')
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

    const { categories } = req.body;

    // Verify all categories belong to the user
    const categoryIds = categories.map(cat => cat.id);
    const userCategories = await Category.find({
      _id: { $in: categoryIds },
      user: req.user.id
    });

    if (userCategories.length !== categories.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more categories not found or do not belong to you'
      });
    }

    // Update order for each category
    const updatePromises = categories.map(cat =>
      Category.findByIdAndUpdate(cat.id, { order: cat.order }, { new: true })
    );

    const updatedCategories = await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Categories reordered successfully',
      data: updatedCategories
    });
  } catch (error) {
    console.error('Reorder categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error reordering categories'
    });
  }
});

// @desc    Get category statistics
// @route   GET /api/categories/:id/stats
// @access  Private
router.get('/:id/stats', async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Update stats before returning
    await category.updateStats();

    // Get habits in this category
    const habits = await Habit.find({ 
      category: req.params.id,
      isActive: true 
    }).select('name icon color stats streak');

    res.json({
      success: true,
      data: {
        category: {
          id: category._id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          stats: category.stats
        },
        habits
      }
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting category statistics'
    });
  }
});

module.exports = router;
