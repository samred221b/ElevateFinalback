# Habit Tracker Backend API

A comprehensive Node.js/Express backend API for the Habit Tracker application with MongoDB integration.

## Features

- 🔐 **Authentication & Authorization** - JWT-based auth with secure password hashing
- 👤 **User Management** - Profile management, preferences, and statistics
- 📝 **Categories** - Organize habits into customizable categories
- ✅ **Habits** - Create, manage, and track habits with various target types
- 📊 **Logging** - Track daily completions with mood and difficulty ratings
- 📈 **Analytics** - Comprehensive analytics for habits, categories, and user performance
- 🔒 **Security** - Rate limiting, input validation, and security headers
- 📱 **API Documentation** - RESTful API with consistent response format

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Express Validator
- **Security**: Helmet, CORS, Rate Limiting
- **Password Hashing**: bcryptjs

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your configuration:
   ```env
   MONGODB_URI=mongodb://localhost:27017/habit-tracker
   JWT_SECRET=your-super-secret-jwt-key
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start the server**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Verify installation**
   ```bash
   curl http://localhost:5000/api/health
   ```

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Register new user
- `POST /login` - User login
- `GET /me` - Get current user
- `PUT /profile` - Update user profile
- `PUT /password` - Change password
- `POST /refresh` - Refresh JWT token

### Users (`/api/users`)
- `GET /profile` - Get user profile
- `PUT /profile` - Update profile
- `PUT /preferences` - Update preferences
- `GET /stats` - Get user statistics
- `GET /activity` - Get activity feed
- `GET /export` - Export user data
- `DELETE /account` - Delete account

### Categories (`/api/categories`)
- `GET /` - Get all categories
- `GET /:id` - Get single category
- `POST /` - Create category
- `PUT /:id` - Update category
- `DELETE /:id` - Delete category
- `PUT /reorder` - Reorder categories
- `GET /:id/stats` - Get category statistics

### Habits (`/api/habits`)
- `GET /` - Get all habits
- `GET /:id` - Get single habit
- `POST /` - Create habit
- `PUT /:id` - Update habit
- `DELETE /:id` - Delete habit
- `GET /templates/list` - Get habit templates
- `POST /templates/:templateId` - Create from template
- `PUT /reorder` - Reorder habits
- `GET /:id/stats` - Get habit statistics

### Logs (`/api/logs`)
- `GET /` - Get logs with pagination
- `GET /:id` - Get single log
- `POST /` - Create/update log
- `PUT /:id` - Update log
- `DELETE /:id` - Delete log
- `GET /range/:startDate/:endDate` - Get logs for date range
- `GET /stats/completion` - Get completion statistics
- `GET /stats/streak/:habitId` - Get streak information
- `POST /bulk` - Bulk create/update logs

### Analytics (`/api/analytics`)
- `GET /dashboard` - Dashboard analytics
- `GET /habits` - Habit performance analytics
- `GET /categories` - Category analytics
- `GET /streaks` - Streak analytics
- `GET /mood` - Mood analytics

## Data Models

### User
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  avatar: String,
  preferences: {
    theme: String,
    notifications: Object,
    timezone: String
  },
  stats: {
    totalHabits: Number,
    totalCompletions: Number,
    currentStreak: Number,
    longestStreak: Number
  },
  isActive: Boolean,
  lastLogin: Date
}
```

### Category
```javascript
{
  name: String,
  description: String,
  color: String (hex),
  icon: String,
  user: ObjectId,
  isDefault: Boolean,
  order: Number,
  stats: Object
}
```

### Habit
```javascript
{
  name: String,
  description: String,
  icon: String,
  color: String (hex),
  category: ObjectId,
  user: ObjectId,
  frequency: String,
  difficulty: String,
  target: {
    type: String,
    value: Number,
    unit: String
  },
  reminder: Object,
  streak: Object,
  stats: Object,
  isActive: Boolean,
  order: Number
}
```

### Log
```javascript
{
  habit: ObjectId,
  user: ObjectId,
  date: Date,
  completed: Boolean,
  value: Number,
  unit: String,
  notes: String,
  mood: String,
  difficulty: String,
  completedAt: Date,
  streak: Number
}
```

## Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt with salt rounds
- **Rate Limiting** - Prevent API abuse
- **Input Validation** - Comprehensive request validation
- **CORS Protection** - Configurable cross-origin requests
- **Security Headers** - Helmet.js security middleware
- **Environment Variables** - Secure configuration management

## Error Handling

The API uses consistent error response format:

```javascript
{
  success: false,
  message: "Error description",
  errors: [] // Validation errors if applicable
}
```

## Success Response Format

```javascript
{
  success: true,
  message: "Operation successful", // Optional
  data: {}, // Response data
  count: 10, // For paginated responses
  page: 1, // Current page
  pages: 5 // Total pages
}
```

## Development

### Scripts
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (when implemented)

### Database Seeding

The API automatically creates default categories for new users:
- Health & Fitness
- Learning
- Productivity
- Mindfulness
- Social

### Logging

The API uses Morgan for HTTP request logging in development mode.

## Deployment

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/habit-tracker
JWT_SECRET=your-production-secret-key
PORT=5000
FRONTEND_URL=https://your-frontend-domain.com
```

### MongoDB Atlas Setup
1. Create a MongoDB Atlas account
2. Create a new cluster
3. Create a database user
4. Get the connection string
5. Update `MONGODB_URI` in your environment

## API Testing

You can test the API using tools like:
- **Postman** - Import the collection (create one from the endpoints above)
- **curl** - Command line testing
- **Insomnia** - REST client

Example API call:
```bash
# Register a new user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
