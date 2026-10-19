import User from '#models/user'
import { randomBytes, randomUUID } from 'node:crypto'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import Organization from '#models/organization'
import type { OrganizationMemberInput } from '#validators/organization_member'
import OrganizationMember from '#models/organization_member'

export default class MembershipService {
  async create(organization: Organization, input: OrganizationMemberInput) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await db.transaction(async (trx) => {
          await Organization.query({ client: trx })
            .where('id', organization.id)
            .forUpdate()
            .firstOrFail()
          const user = await User.firstOrCreate(
            { phone: input.phone },
            {
              fullName: input.fullName,
              username: null,
              password: randomBytes(32).toString('hex'),
              isPending: true,
            },
            { client: trx }
          )
          const existing = await OrganizationMember.query({ client: trx })
            .where('organization_id', organization.id)
            .where('user_id', user.id)
            .first()
          if (existing) throw new Exception('Phone already belongs to a member', { status: 409 })
          const member = await OrganizationMember.create(
            { id: randomUUID(), organizationId: organization.id, userId: user.id, role: 'member' },
            { client: trx }
          )
          member.$setRelated('user', user)
          return member
        })
      } catch (error) {
        const failure = error as { code?: string; constraint?: string }
        // A different organizer may create the same phone between lookup and insert.
        if (
          attempt === 0 &&
          failure.code === '23505' &&
          failure.constraint === 'users_phone_unique'
        )
          continue
        throw error
      }
    }
  }

  listForOrganizer(organization: Organization, page = 1) {
    return OrganizationMember.query()
      .where('organization_id', organization.id)
      .preload('user')
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .paginate(page, 25)
  }

  listForUser(userId: number, page = 1) {
    return OrganizationMember.query()
      .where('user_id', userId)
      .preload('organization')
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .paginate(page, 25)
  }
}
