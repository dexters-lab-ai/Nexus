import { get } from '../utils/api-helpers.js';

export const getMessageHistory = (page = 1, limit = 50, since = null) => {
  const params = { page, limit };
  
  // Add the since parameter if provided
  if (since) {
    params.since = since;
  }
  
  return get('/messages/history', params);
};
