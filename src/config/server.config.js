export default {
    cors: {
      allowedOrigins: (process.env.ALLOWED_CORS_ORIGINS || 'http://localhost:3000').split(','),
    },
    session: {
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    },
  };