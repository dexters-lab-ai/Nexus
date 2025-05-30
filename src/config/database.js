import mongoose from 'mongoose';
import pRetry from 'p-retry';
import { AbortError } from 'p-retry';

/**
 * Internal function to attempt MongoDB connection
 */
const attemptMongoDBConnection = async () => {
  const startTime = Date.now();
  
  // Debug: Log environment variables
  console.log('Environment Variables:', {
    NODE_ENV: process.env.NODE_ENV,
    MONGO_URI: process.env.MONGO_URI ? '*** URI set (hidden for security) ***' : 'Not set',
    MONGO_URI_LENGTH: process.env.MONGO_URI ? process.env.MONGO_URI.length : 0
  });
  
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not defined in environment variables');
    throw new AbortError('MONGO_URI is not defined in environment variables');
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    console.log(`MongoDB Connected to ${conn.connection.host} in ${Date.now() - startTime}ms`);
    return conn;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    
    // Check if this is a temporary error that warrants a retry
    const isTemporaryError = 
      err.name === 'MongoNetworkError' || 
      err.message.includes('topology was destroyed') || 
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('timed out');
    
    if (!isTemporaryError) {
      // If it's a permanent error (like auth failure), abort retries
      throw new AbortError(`MongoDB permanent connection error: ${err.message}`);
    }
    
    // For temporary errors, throw the original error to allow retry
    throw err;
  }
};

/**
 * Connect to MongoDB with retry logic
 */
const connectDB = async () => {
  return pRetry(attemptMongoDBConnection, {
    retries: 5,
    minTimeout: 2000,
    onFailedAttempt: error => {
      console.log(`MongoDB connection attempt ${error.attemptNumber} failed. Retrying...`);
    }
  });
};

/**
 * Close database connection
 */
const closeDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    throw error;
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});

export { connectDB, closeDB };
