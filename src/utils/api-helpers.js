// Dynamic API base URL resolution
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:3420`; // Development port
  }
  return window.location.origin; // Production
};

const API_BASE = getApiBaseUrl();
console.log('[api-helpers] API_BASE:', API_BASE);

const API_CONFIG = {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
};

export async function fetchAPI(url, options = {}) {
  // Ensure URL is properly formatted
  const endpoint = url.startsWith('/') ? url : `/${url}`;
  // Don't add /api prefix if it's already included or if we have a full URL
  const isFullUrl = endpoint.startsWith('http');
  const apiPath = isFullUrl || url.startsWith('/api') ? endpoint : `/api${endpoint}`;
  
  // Construct the full URL
  const fullUrl = isFullUrl ? endpoint : `${API_BASE}${apiPath}`;
  
  console.log('[api-helpers] fetchAPI called:', {
    url,
    endpoint,
    fullUrl,
    options
  });
  
  try {
    const response = await fetch(fullUrl, {
      ...API_CONFIG,
      ...options,
      headers: {
        ...API_CONFIG.headers,
        ...(options.headers || {})
      }
    });

    // Handle error responses
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`API Error (${response.status}):`, {
        status: response.status,
        statusText: response.statusText,
        url: fullUrl,
        response: responseText.substring(0, 500) // First 500 chars of response
      });
      
      try {
        const errorJson = JSON.parse(responseText);
        throw new Error(errorJson.error || `API Error: ${response.status} ${response.statusText}`);
      } catch (parseError) {
        throw new Error(`API Error (${response.status}): ${response.statusText} - ${responseText.substring(0, 200)}`);
      }
    }
    
    // Handle empty responses
    if (!responseText) return null;
    
    // Try to parse as JSON if content-type is json or if response looks like JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || 
        (responseText.trim().startsWith('{') || responseText.trim().startsWith('['))) {
      try {
        return JSON.parse(responseText);
      } catch (e) {
        console.warn('Failed to parse JSON response:', e);
        return responseText;
      }
    }
    
    return responseText;
  } catch (error) {
    console.error('API request failed:', {
      error: error.message,
      url: fullUrl,
      options
    });
    throw error;
  }
}

export async function get(url, params = {}) {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, value);
    }
  });
  const queryString = queryParams.toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  return fetchAPI(fullUrl, { method: 'GET' });
}

export async function post(url, data = {}) {
  return fetchAPI(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function put(url, data = {}) {
  return fetchAPI(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function del(url, data = null) {
  const options = { method: 'DELETE' };
  if (data) {
    options.body = JSON.stringify(data);
  }
  return fetchAPI(url, options);
}
