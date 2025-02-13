import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Please connect to Supabase by clicking the "Connect to Supabase" button in the top right corner.'
  );
}

// Maximum number of retry attempts
const MAX_RETRIES = 3;
// Base delay in milliseconds (will be multiplied by 2^retry)
const BASE_DELAY = 1000;
// Maximum timeout for requests in milliseconds
const REQUEST_TIMEOUT = 15000;

// Exponential backoff delay calculation
const getRetryDelay = (retry: number) => {
  return Math.min(BASE_DELAY * Math.pow(2, retry), 5000);
};

// Create a custom fetch implementation with retries, timeout, and auth headers
const fetchWithRetries = async (url: string, options: RequestInit = {}): Promise<Response> => {
  let lastError: Error | null = null;
  
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...options.headers,
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      // Only retry on network errors or 5xx server errors
      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if it was a timeout or user abort
      if (error instanceof Error && 
         (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw error;
      }

      // Last retry failed
      if (retry === MAX_RETRIES - 1) {
        throw new Error(`Failed after ${MAX_RETRIES} retries: ${lastError.message}`);
      }

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, getRetryDelay(retry)));
    }
  }

  throw lastError;
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: localStorage
  },
  global: {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    },
    fetch: fetchWithRetries
  }
});

// Add connection status check
export const checkSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.from('guests').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
};

// Add reconnection logic with exponential backoff
let reconnectAttempts = 0;
const maxReconnectAttempts = 3;

export const handleConnectionError = async (): Promise<boolean> => {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error('Max reconnection attempts reached');
    return false;
  }

  reconnectAttempts++;
  
  try {
    const isConnected = await checkSupabaseConnection();
    if (isConnected) {
      reconnectAttempts = 0;
      return true;
    }

    // Wait with exponential backoff before retrying
    await new Promise(resolve => 
      setTimeout(resolve, getRetryDelay(reconnectAttempts - 1))
    );
  } catch (error) {
    console.error('Reconnection attempt failed:', error);
  }

  return false;
};

// Reset reconnection attempts periodically
setInterval(() => {
  reconnectAttempts = 0;
}, 60000); // Reset every minute