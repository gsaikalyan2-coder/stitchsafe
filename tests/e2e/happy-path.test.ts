import { test, expect } from '@playwright/test'

test.describe('happy path — navigation and API contracts', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('unauthenticated /customer redirects to /login', async ({ page }) => {
    await page.goto('/customer')
    await expect(page).toHaveURL(/\/login/)
  })

  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
  })

  test('POST /api/orders with invalid body returns 400 VALIDATION', async ({ request }) => {
    const res = await request.post('/api/orders', { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('VALIDATION')
  })

  test('GET /api/dashboard/customer without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/dashboard/customer')
    expect(res.status()).toBe(401)
  })
})
