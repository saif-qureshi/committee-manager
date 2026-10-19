import { Exception } from '@adonisjs/core/exceptions'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMember from '#models/organization_member'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'

type RegisterUserInput = Pick<User, 'fullName' | 'password'> & {
  username?: string
  phone?: string
  accountType: 'organizer' | 'member'
  organizationName?: string
}

export default class AuthService {
  async register({
    fullName,
    username,
    phone,
    password,
    accountType,
    organizationName,
  }: RegisterUserInput) {
    const user = await db.transaction(async (trx) => {
      const registered = await User.create(
        { fullName, username: username ?? null, phone: phone ?? null, password },
        { client: trx }
      )
      if (accountType === 'organizer') {
        const organization = await Organization.create(
          { id: randomUUID(), ownerId: registered.id, name: organizationName ?? 'My committees' },
          { client: trx }
        )
        await OrganizationMember.create(
          {
            id: randomUUID(),
            organizationId: organization.id,
            userId: registered.id,
            role: 'organizer',
          },
          { client: trx }
        )
      }
      return registered
    })
    return this.createSession(user)
  }

  async login(identifier: string, password: string) {
    const user = await User.verifyCredentials(identifier, password)
    return this.createSession(user)
  }

  async logout(user: User) {
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }
  }

  async createSession(user: User) {
    if (user.isPending)
      throw new Exception('Invalid credentials', { status: 401, code: 'E_INVALID_CREDENTIALS' })
    const token = await User.accessTokens.create(user)
    return { user, token: token.value!.release() }
  }
}
