import { test } from '@japa/runner'

test('health endpoint responds without authentication', async ({ client }) => {
  const response = await client.get('/health')

  response.assertStatus(200)
  response.assertBody({ status: 'ok' })
})

test('profile endpoint requires authentication', async ({ client }) => {
  const response = await client.get('/api/v1/account/profile')

  response.assertStatus(401)
})
