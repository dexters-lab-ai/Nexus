import config from '../config/server.config.js';

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin && config.cors.allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  } else if (origin) {
    console.warn(`Blocked request from disallowed origin: ${origin}`);
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  
  next();
};

export default corsMiddleware;