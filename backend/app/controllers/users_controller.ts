import { inject } from '@adonisjs/core'
import AuthService from '#services/auth_service'
import { createUserValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

@inject()
export default class UsersController {
  constructor(private sessions: AuthService) {}

  async store({ request, response, serialize }: HttpContext) {
    const input = await request.validateUsing(createUserValidator)
    const { user, token } = await this.sessions.register(input)

    response.status(201)
    return serialize({
      user: UserTransformer.transform(user),
      token,
    })
  }
  async show({ auth, serialize }: HttpContext) {
    return serialize(UserTransformer.transform(auth.getUserOrFail()))
  }
}
