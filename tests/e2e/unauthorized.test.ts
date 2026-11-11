import { test, expect } from '@playwright/test'

test.describe('unauthorized access', () => {
  test('GET /api/orders/:id without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/orders/fake-id')
    expect(res.status()).toBe(401)
  })

  test('POST /api/orders/:id/start without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/orders/fake-id/start')
    expect(res.status()).toBe(401)
  })

  test('POST /api/orders/:id/release without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/orders/fake-id/release')
    expect(res.status()).toBe(401)
  })

  test('unauthenticated /customer redirects to /login', async ({ page }) => {
    await page.goto('/customer')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated /tailor redirects to /login', async ({ page }) => {
    await page.goto('/tailor')
    await expect(page).toHaveURL(/\/login/)
  })
})
