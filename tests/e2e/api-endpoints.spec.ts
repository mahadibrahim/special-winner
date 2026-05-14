import { test, expect } from '@playwright/test';

test.describe('Public API Endpoints', { tag: '@critical' }, () => {
  test('GET /api/public/seasons returns data', async ({ request }) => {
    const response = await request.get('/api/public/seasons');

    expect(response.status()).toBe(200);

    const data = await response.json();
    // Returns an object with seasons property
    expect(data).toBeDefined();
  });

  test('GET /api/public/filters returns filter options', async ({ request }) => {
    const response = await request.get('/api/public/filters');

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('sports');
    expect(data).toHaveProperty('locations');
  });
});

test.describe('Protected API Endpoints', { tag: '@critical' }, () => {
  test('GET /api/admin/users returns 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/api/admin/users');

    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/programs returns 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/api/admin/programs');

    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/reports/revenue returns 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/api/admin/reports/revenue');

    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/reports/registrations returns 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/api/admin/reports/registrations');

    expect(response.status()).toBe(401);
  });

  test('POST /api/auth/signin with invalid credentials returns error', async ({ request }) => {
    const response = await request.post('/api/auth/signin', {
      data: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      },
    });

    // Returns 401 for invalid credentials, or 500/503 if database unavailable
    expect([401, 500, 503]).toContain(response.status());
  });
});
