// src/routes/index.ts
import { Router, Request, Response } from 'express';
import userRoutes from './user.routes';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes'; // Import admin routes
import messageRoutes from './message.routes';
import queryRoutes from './query.routes'; // New import
import { authenticate, authorize } from '@/middlewares/auth.middleware'; // Import both
import { Role } from '@prisma/client'; // Import Role enum
import { teacherRouter, adminRouter } from './attendance.routes';
import reportRoutes from './report.routes';
import teacherSpecificRoutes from './teacher.routes'; // New import for general teacher routes
import notificationRoutes from './notification.routes';

const router = Router();

// Health check route - Now Admin Only
// It needs to be authenticated first, then authorized.
router.get(
  '/health',
  authenticate, // 1. Ensure user is logged in and token is valid
  authorize(Role.ADMIN), // 2. Ensure user has the ADMIN role
  (req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      message: 'Health check successful (Admin Access)',
      timestamp: new Date().toISOString(),
      user: req.user // Optionally include user info from token
    });
  }
);

// Mount auth routes (public)
router.use('/auth', authRoutes);

// Mount user routes (protected by authentication)
// You can add role-specific authorization to individual user routes as needed.
// For example, if creating users is admin-only:
// userRoutes.post('/', authorize([Role.ADMIN]), userController.createUser);
// Then apply authenticate at the router level:
router.use('/users', authenticate, userRoutes);

// Mount admin routes (protected by authentication AND admin role authorization)
router.use('/admin', authenticate, authorize(Role.ADMIN), adminRoutes);

// Teacher-specific routes
router.use(
  '/teacher/attendance',
  authenticate,
  authorize(Role.TEACHER), // Only Teachers
  teacherRouter // This will map to POST /teacher/attendance/
);

// General Teacher-specific routes (NEW)
router.use(
  '/teacher', // Base path for teacher specific functionalities
  authenticate,
  authorize(Role.TEACHER), // Ensure only teachers can access routes mounted here
  teacherSpecificRoutes     // Mounts GET /timetable, resulting in /api/teacher/timetable
);

// Admin-specific routes (for attendance override)
router.use(
  '/admin/attendance',
  authenticate,
  authorize(Role.ADMIN), // Only Admins
  adminRouter // This will map to PATCH /admin/attendance/:id
);

router.use(
  '/admin/reports', // Base path for all reports
  authenticate,
  authorize(Role.ADMIN),
  reportRoutes
);

// Message Routes (all authenticated users can access these)
router.use(
  '/messages',
  authenticate, // All message routes require a logged-in user
  messageRoutes
);

// Parent Query Routes
router.use(
  '/queries',
  authenticate, // All /queries routes need authentication
  queryRoutes // Role authorization is handled in query.routes.ts
);

// Notification Routes (all authenticated users can access their own notifications)
router.use(
  '/notifications',
  authenticate, // All notification routes require a logged-in user
  notificationRoutes
);

export default router;