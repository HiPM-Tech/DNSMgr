import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  // Token is now stored in httpOnly cookie, automatically sent by browser
  // No need to manually add Authorization header for most requests
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Don't automatically redirect on 401
    // Let individual components handle authentication errors
    // This prevents unwanted redirects on public pages like Landing
    return Promise.reject(err);
  }
);

// ─── Common Types ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  msg: string;
}
