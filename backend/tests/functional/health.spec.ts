import { test } from '@japa/runner'

test('health endpoint responds without authentication', async ({ client }) => {
  const response = await client.request('/health', 'GET')

  response.assertStatus(200)
  response.assertBody({ status: 'ok' })
})

test('profile endpoint requires authentication', async ({ client }) => {
  const response = await client.request('/api/v1/users/me', 'GET')

  response.assertStatus(401)
})
