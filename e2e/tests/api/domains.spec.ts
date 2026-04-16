import { test, expect } from '@playwright/test';

/**
 * Domains API E2E Tests
 * 
 * Tests the domain management endpoints:
 * - GET /api/domains
 * - POST /api/domains
 * - GET /api/domains/:id
 * - PUT /api/domains/:id
 * - DELETE /api/domains/:id
 */

test.describe('Domains API', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  let authToken: string;
  let testDomainId: number;

  test.beforeAll(async ({ request }) => {
    // Login to get auth token
    const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
      data: {
        username: 'admin',
        password: 'admin',
      },
    });

    if (loginResponse.status() === 200) {
      const body = await loginResponse.json();
      authToken = body.data.token;
    }
  });

  test('should require authentication', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/domains`);
    expect(response.status()).toBe(401);
  });

  test('should list domains', async ({ request }) => {
    if (!authToken) {
      test.skip();
      return;
    }

    const response = await request.get(`${baseURL}/api/domains`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('should create a new domain', async ({ request }) => {
    if (!authToken) {
      test.skip();
      return;
    }

    // First, we need a DNS account
    const accountsResponse = await request.get(`${baseURL}/api/accounts`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (accountsResponse.status() !== 200) {
      test.skip();
      return;
    }

    const accountsBody = await accountsResponse.json();
    if (!accountsBody.data || accountsBody.data.length === 0) {
      test.skip();
      return;
    }

    const accountId = accountsBody.data[0].id;

    const response = await request.post(`${baseURL}/api/domains`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: `test-domain-${Date.now()}.com`,
        account_id: accountId,
        remark: 'E2E test domain',
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.code).toBe(0);
    expect(body.data.id).toBeDefined();
    testDomainId = body.data.id;
  });

  test('should get domain by id', async ({ request }) => {
    if (!authToken || !testDomainId) {
      test.skip();
      return;
    }

    const response = await request.get(`${baseURL}/api/domains/${testDomainId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(testDomainId);
  });

  test('should update domain', async ({ request }) => {
    if (!authToken || !testDomainId) {
      test.skip();
      return;
    }

    const response = await request.put(`${baseURL}/api/domains/${testDomainId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        remark: 'Updated remark from E2E test',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.code).toBe(0);
  });

  test('should delete domain', async ({ request }) => {
    if (!authToken || !testDomainId) {
      test.skip();
      return;
    }

    const response = await request.delete(`${baseURL}/api/domains/${testDomainId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.code).toBe(0);
  });
});
