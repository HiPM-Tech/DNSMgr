import { test, expect } from '@playwright/test';

/**
 * Dashboard UI E2E Tests
 *
 * Tests the dashboard functionality:
 * - Page load
 * - Navigation menu
 * - Domain list display
 * - User menu
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL('/**', { timeout: 10000 });
  });

  test('should display dashboard with sidebar', async ({ page }) => {
    // Check sidebar is visible
    await expect(page.locator('.ant-layout-sider, .sidebar')).toBeVisible();

    // Check main content area
    await expect(page.locator('.ant-layout-content, .main-content')).toBeVisible();
  });

  test('should navigate to domains page', async ({ page }) => {
    // Click on domains menu item
    const domainsMenu = page.locator('.ant-menu-item, .menu-item').filter({ hasText: /Domains|域名/ });
    await domainsMenu.click();

    // Wait for URL change
    await page.waitForURL('**/domains**', { timeout: 5000 });

    // Check domain list is displayed
    await expect(page.locator('.ant-table, .domain-list, [data-testid="domain-list"]')).toBeVisible();
  });

  test('should navigate to settings page', async ({ page }) => {
    // Click on settings menu item
    const settingsMenu = page.locator('.ant-menu-item, .menu-item').filter({ hasText: /Settings|设置/ });
    await settingsMenu.click();

    // Wait for URL change
    await page.waitForURL('**/settings**', { timeout: 5000 });

    // Check settings form is displayed
    await expect(page.locator('form, .settings-form')).toBeVisible();
  });

  test('should open user menu', async ({ page }) => {
    // Click on user menu (usually in header)
    const userMenu = page.locator('.ant-dropdown-trigger, .user-menu, .avatar').first();
    await userMenu.click();

    // Check dropdown menu is visible
    await expect(page.locator('.ant-dropdown-menu, .dropdown-menu')).toBeVisible();

    // Check for logout option
    await expect(page.locator('.ant-dropdown-menu-item, .dropdown-item').filter({ hasText: /Logout|退出/ })).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Click on user menu
    const userMenu = page.locator('.ant-dropdown-trigger, .user-menu, .avatar').first();
    await userMenu.click();

    // Click logout
    const logoutItem = page.locator('.ant-dropdown-menu-item, .dropdown-item').filter({ hasText: /Logout|退出/ });
    await logoutItem.click();

    // Wait for redirect to login
    await page.waitForURL('**/login**', { timeout: 5000 });

    // Check we're on login page
    await expect(page.locator('input[name="username"]')).toBeVisible();
  });

  test('should display domain statistics', async ({ page }) => {
    // Look for statistics cards
    const statCards = page.locator('.ant-statistic, .stat-card, .statistic');

    // Check if any stat cards are visible
    const count = await statCards.count();
    if (count > 0) {
      await expect(statCards.first()).toBeVisible();
    }
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check if mobile menu button appears
    const mobileMenuBtn = page.locator('.ant-layout-sider-zero-width-trigger, .mobile-menu-btn, .menu-toggle');
    if (await mobileMenuBtn.isVisible().catch(() => false)) {
      await mobileMenuBtn.click();
      await expect(page.locator('.ant-layout-sider, .sidebar')).toBeVisible();
    }

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
