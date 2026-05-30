import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  withCredentials: true, // Required for httpOnly cookies
});

api.interceptors.request.use((config) => {
  // Token is now stored in httpOnly cookie, automatically sent by browser
  // No need to manually add Authorization header for most requests
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Handle 401 Unauthorized - redirect to login
    if (err.response?.status === 401) {
      // Only redirect if we're not already on the login page
      // and we're not on the landing page (which is public)
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/' && !currentPath.startsWith('/oauth/')) {
        // Clear any cached auth state by reloading
        // The AuthContext will detect no valid session and set user to null
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ─── Common Types ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  msg: string;
}
