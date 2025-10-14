import { Prisma } from '@prisma/client';

/**
 * Error handler middleware
 * Should be the last middleware in your Express app
 */
export function errorHandler(err, req, res, next) {
  console.error(err);

  // Handle Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Example: Unique constraint failed
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Duplicate value error', details: err.meta });
    }
    return res.status(400).json({ message: 'Database error', details: err.meta });
  }

  // Handle validation errors (optional, if using Zod/Joi)
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message, details: err.errors });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token expired' });
  }

  // Default server error
  return res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error'
  });
}
