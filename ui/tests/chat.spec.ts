import { test, expect } from '@playwright/test';

// Uses the deterministic "/demo" run path (no live browser/model), so it
// verifies the UI mechanics required by the spec: tool calls collapse into
// expandable groups, send_to_user + final break out as visible messages, the
// selected SOP renders as markdown, and the approval round-trip works.

test('demo run: grouping, SOP panel, approval round-trip, final message', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('ticket').fill('/demo');
  await page.getByTestId('send').click();

  // The selected SOP renders as markdown in the right-hand panel.
  await expect(page.getByTestId('sop-body')).toContainText('B2B Sales Order Entry', {
    timeout: 15000,
  });

  // Tool calls are grouped and COLLAPSED by default.
  const group = page.getByTestId('work-group').first();
  await expect(group).toBeVisible();
  expect(await group.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);

  // Expanding reveals the underlying steps (e.g. the browser tool call).
  await group.locator('summary').click();
  await expect(group).toContainText('browser');

  // send_to_user content is visible without expanding anything.
  await expect(page.getByTestId('send-to-user')).toContainText('Requesting approval');

  // Approval card appears and blocks; approving lets the run finish.
  await expect(page.getByTestId('approval')).toBeVisible();
  await page.getByTestId('approve').click();
  await expect(page.getByTestId('approval')).toContainText('approved');

  // Final message breaks out and is visible.
  await expect(page.getByTestId('final')).toContainText('SO527901', { timeout: 15000 });
});

test('demo run: rejecting an approval stops the task', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('ticket').fill('/demo');
  await page.getByTestId('send').click();
  await expect(page.getByTestId('approval')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('reject').click();
  await expect(page.getByTestId('final')).toContainText('rejected', { timeout: 15000 });
});
