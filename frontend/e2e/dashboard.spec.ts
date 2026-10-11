import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('loads the dashboard without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('#sidebar-navigation')).toBeVisible();
  await expect(page.getByText('Overview Dashboard').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Linear Programming tab shows the solved optimum', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Linear Programming', { exact: true }).first().click();
  // Matches the Excel Solver baseline of ~200.5 cases/week at 320 h.
  await expect(page.getByText(/200\.5/).first()).toBeVisible();
});

test('Excel export downloads a workbook that can be imported back', async ({ page }) => {
  await page.goto('/');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#sidebar-export-excel-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Hospital_OR_Capacity_Dataset.xlsx');
  const path = await download.path();
  expect(readFileSync(path).subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip

  await page.locator('input[type="file"]').first().setInputFiles(path);
  await expect(page.getByText(/Successfully parsed and loaded/).first()).toBeVisible();
});

test('LP tab shows the capacity what-if chart', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Linear Programming', { exact: true }).first().click();
  await expect(page.getByText('What-if: weekly cases vs total OR capacity')).toBeVisible();
  await expect(page.locator('.recharts-line-curve').first()).toBeVisible();
});
