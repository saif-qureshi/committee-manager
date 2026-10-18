import { inject } from '@adonisjs/core'
import AuthService from '#services/auth_service'
import { createSessionValidator } from '#validators/session'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

@inject()
export default class SessionsController {
  constructor(private sessions: AuthService) {}

  async store({ request, response, serialize }: HttpContext) {
    const { identifier, password } = await request.validateUsing(createSessionValidator)

    const { user, token } = await this.sessions.login(identifier, password)

    response.status(201)
    return serialize({
      user: UserTransformer.transform(user),
      token,
    })
  }

  async destroy({ auth, response }: HttpContext) {
    await this.sessions.logout(auth.getUserOrFail())

    return response.noContent()
  }
}
