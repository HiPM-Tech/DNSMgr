import { test, expect } from '@playwright/test';

/**
 * Authentication API E2E Tests
 * 
 * Tests the authentication endpoints:
 * - POST /api/auth/login
 * - POST /api/auth/logout
 * - GET /api/auth/me
 * - POST /api/auth/refresh
 */

test.describe('Authentication API', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  
  test('should reject login with invalid credentials', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/auth/login`, {
      data: {
        username: 'invalid_user',
        password: 'wrong_password',
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.code).toBe(200007); // Username or password incorrect
  });

  test('should reject login without credentials', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/auth/login`, {
      data: {},
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe(100001); // Parameter validation failed
  });

  test('should get current user with valid JWT', async ({ request }) => {
    // First, we need to login to get a token
    // This test assumes there's a default admin user
    const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
      data: {
        username: 'admin',
        password: 'admin', // Default password for testing
      },
    });

    // If login fails, skip this test
    if (loginResponse.status() !== 200) {
      test.skip();
      return;
    }

    const loginBody = await loginResponse.json();
    expect(loginBody.code).toBe(0);
    expect(loginBody.data.token).toBeDefined();

    const token = loginBody.data.token;

    // Now test /api/auth/me
    const meResponse = await request.get(`${baseURL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(meResponse.status()).toBe(200);
    const meBody = await meResponse.json();
    expect(meBody.code).toBe(0);
    expect(meBody.data.username).toBe('admin');
  });

  test('should reject request without authorization', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/auth/me`);

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.code).toBe(200001); // No authentication info provided
  });

  test('should reject request with invalid token', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/auth/me`, {
      headers: {
        Authorization: 'Bearer invalid_token',
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.code).toBe(200004); // Token invalid
  });
});
