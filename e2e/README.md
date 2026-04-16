# DNSMgr E2E Tests

This directory contains end-to-end tests for DNSMgr using Playwright.

## Structure

```
e2e/
├── tests/
│   ├── api/          # API endpoint tests
│   │   ├── auth.spec.ts
│   │   └── domains.spec.ts
│   └── ui/           # UI/Frontend tests
│       ├── login.spec.ts
│       └── dashboard.spec.ts
├── playwright.config.ts
├── package.json
└── README.md
```

## Installation

```bash
# Install dependencies
cd e2e
npm install

# Install Playwright browsers
npx playwright install
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests with UI mode
npm run test:ui

# Run only API tests
npm run test:api

# Run specific test file
npx playwright test api/auth.spec.ts

# Debug tests
npm run test:debug
```

## Test Reports

```bash
# Show HTML report
npm run report
```

## Environment Variables

- `BASE_URL`: Base URL of the application (default: http://localhost:3000)
- `CI`: Set to true for CI environment

## Writing Tests

### API Tests

```typescript
import { test, expect } from '@playwright/test';

test('should login', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { username: 'admin', password: 'admin' }
  });
  expect(response.status()).toBe(200);
});
```

### UI Tests

```typescript
import { test, expect } from '@playwright/test';

test('should login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
});
```

## Code Generation

```bash
# Generate tests by recording user actions
npx playwright codegen http://localhost:3000
```

## CI/CD Integration

Tests are configured to run in CI environments with:
- Parallel execution disabled
- Retry on failure
- HTML and list reporters
- Screenshots and videos on failure
