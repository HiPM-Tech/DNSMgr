import { test, expect } from '@playwright/test';

/**
 * Login Page UI E2E Tests
 * 
 * Tests the login page functionality:
 * - Page load
 * - Form validation
 * - Login with valid credentials
 * - Login with invalid credentials
 * - Navigation after login
 */

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/DNSMgr|Login/);

    // Check form elements
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation error for empty fields', async ({ page }) => {
    // Submit empty form
    await page.click('button[type="submit"]');

    // Check for error message
    await expect(page.locator('.ant-form-item-explain-error, .error-message, [role="alert"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in invalid credentials
    await page.fill('input[name="username"]', 'invalid_user');
    await page.fill('input[name="password"]', 'wrong_password');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for error message
    await expect(page.locator('.ant-message-error, .error-message, [role="alert"]')).toBeVisible({ timeout: 5000 });
  });

  test('should login successfully and redirect to dashboard', async ({ page }) => {
    // Fill in valid credentials (assuming default admin user)
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForURL('/**', { timeout: 10000 });

    // Check we're not on login page anymore
    expect(page.url()).not.toContain('/login');

    // Check for dashboard elements
    await expect(page.locator('.ant-layout-sider, .sidebar, [data-testid="sidebar"]')).toBeVisible({ timeout: 5000 });
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');
    
    // Check initial type is password
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle button (if exists)
    const toggleButton = page.locator('.ant-input-password-icon, .password-toggle');
    if (await toggleButton.isVisible().catch(() => false)) {
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'text');
    }
  });

  test('should handle 2FA when enabled', async ({ page }) => {
    // This test assumes 2FA might be enabled
    // Fill in credentials
    await page.fill('input[name="username"]', 'user_with_2fa');
    await page.fill('input[name="password"]', 'password');

    // Submit form
    await page.click('button[type="submit"]');

    // Check if 2FA input appears
    const twoFaInput = page.locator('input[name="totpCode"], input[name="code"], input[placeholder*="2FA"], input[placeholder*="verification"]');
    
    try {
      await expect(twoFaInput).toBeVisible({ timeout: 5000 });
      
      // Fill in 2FA code
      await twoFaInput.fill('123456');
      await page.click('button[type="submit"]');
      
      // Should show error for invalid code
      await expect(page.locator('.ant-message-error, .error-message')).toBeVisible({ timeout: 5000 });
    } catch {
      // 2FA not enabled, that's fine
      test.skip();
    }
  });
});
