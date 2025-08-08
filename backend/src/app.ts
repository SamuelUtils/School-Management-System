// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mainRouter from '@/routes/index';
import { errorHandler } from '@/middlewares/errorHandler';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

const app: Express = express();

// Middlewares
app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    persistAuthorization: true,
  },
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "School Management System API Documentation"
}));

// Routes
app.use('/api', mainRouter); // Prefix all routes with /api

// Not found handler (should be after all routes)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ message: 'Resource not found' });
});

// Global error handler (should be the last middleware)
app.use(errorHandler);

export { app };