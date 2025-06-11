import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware for authentication endpoints
 * Limits login attempts to prevent brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: true, // Only count failed login attempts
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Please try again later.'
    });
  }
});

/**
 * General rate limiting for API endpoints
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

export default {
  authLimiter,
  apiLimiter
};
