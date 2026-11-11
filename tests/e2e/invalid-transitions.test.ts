import { test, expect } from '@playwright/test'

test.describe('invalid transitions and error response shape', () => {
  test('POST /api/orders/:id/start on nonexistent id returns 401 or 404', async ({ request }) => {
    const res = await request.post('/api/orders/nonexistent-id/start')
    expect([401, 404]).toContain(res.status())
  })

  test('POST /api/orders/:id/propose with empty body returns 401 or 400', async ({ request }) => {
    const res = await request.post('/api/orders/fake/propose', { data: {} })
    expect([400, 401, 404]).toContain(res.status())
  })

  test('error responses include error code and message', async ({ request }) => {
    const res = await request.get('/api/orders/fake-id')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(typeof body.message).toBe('string')
  })

  test('GET /api/orders/:id/events without auth returns 401 with error shape', async ({ request }) => {
    const res = await request.get('/api/orders/fake-id/events')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body).toHaveProperty('message')
  })
})
