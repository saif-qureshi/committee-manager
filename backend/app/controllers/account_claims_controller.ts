import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import AuthService from '#services/auth_service'
import InvitationService from '#services/invitation_service'
import UserTransformer from '#transformers/user_transformer'
import { createAccountClaimValidator } from '#validators/account_claim'

@inject()
export default class AccountClaimsController {
  constructor(
    private invitations: InvitationService,
    private sessions: AuthService
  ) {}

  async store({ request, response, serialize }: HttpContext) {
    const { token, password } = await request.validateUsing(createAccountClaimValidator)
    const user = await this.invitations.claim(token, password)
    const session = await this.sessions.createSession(user)
    response.status(201)
    return serialize({ user: UserTransformer.transform(user), token: session.token })
  }
}
