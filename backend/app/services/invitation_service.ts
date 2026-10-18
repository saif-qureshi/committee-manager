import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import OrganizationMember from '#models/organization_member'
import Organization from '#models/organization'
import type User from '#models/user'
import Invitation from '#models/invitation'

export default class InvitationService {
  create(organization: Organization, userId: number, identifier: string) {
    return db.transaction(async (trx) => {
      await Organization.query({ client: trx })
        .where('id', organization.id)
        .forUpdate()
        .firstOrFail()
      const existing = await OrganizationMember.query({ client: trx })
        .where('organization_id', organization.id)
        .whereHas('user', (query) =>
          query.where('username', identifier).orWhere('phone', identifier)
        )
        .first()
      if (existing) {
        throw new Exception('User is already a member', { status: 409, code: 'E_MEMBER_LINKED' })
      }
      const now = DateTime.utc()
      await Invitation.query({ client: trx })
        .where('organization_id', organization.id)
        .where('recipient_identifier', identifier)
        .whereNull('accepted_at')
        .whereNull('revoked_at')
        .update({ revokedAt: now })

      const token = randomBytes(32).toString('hex')
      const invitation = await Invitation.create(
        {
          id: randomUUID(),
          organizationId: organization.id,
          recipientIdentifier: identifier,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: now.plus({ hours: 72 }),
          createdBy: userId,
        },
        { client: trx }
      )

      return { id: invitation.id, token, expiresAt: invitation.expiresAt }
    })
  }

  accept(user: User, token: string) {
    return db.transaction(async (trx) => {
      const invitation = await Invitation.query({ client: trx })
        .where('token_hash', createHash('sha256').update(token).digest('hex'))
        .firstOrFail()
      // Serialize invitation issue, acceptance, and revocation for this organization.
      const organization = await Organization.query({ client: trx })
        .where('id', invitation.organizationId)
        .forUpdate()
        .firstOrFail()
      await invitation.refresh()
      const now = DateTime.utc()

      if (
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt.toMillis() <= now.toMillis() ||
        (invitation.recipientIdentifier !== user.username &&
          invitation.recipientIdentifier !== user.phone)
      ) {
        throw new Exception('Invitation is unavailable', {
          status: 409,
          code: 'E_INVITATION_UNAVAILABLE',
        })
      }

      const existing = await OrganizationMember.query({ client: trx })
        .where('organization_id', invitation.organizationId)
        .where('user_id', user.id)
        .first()
      if (existing) {
        throw new Exception('Member login is already linked', {
          status: 409,
          code: 'E_MEMBER_LINKED',
        })
      }

      const membership = await OrganizationMember.create(
        { id: randomUUID(), organizationId: organization.id, userId: user.id, role: 'member' },
        { client: trx }
      )
      membership.$setRelated('organization', organization)
      invitation.merge({ acceptedBy: user.id, acceptedAt: now })
      await invitation.save()
      return membership
    })
  }

  revoke(organization: Organization, invitationId: string) {
    return db.transaction(async (trx) => {
      await Organization.query({ client: trx })
        .where('id', organization.id)
        .forUpdate()
        .firstOrFail()
      const invitation = await Invitation.query({ client: trx })
        .where('organization_id', organization.id)
        .where('id', invitationId)
        .firstOrFail()
      await invitation.refresh()

      if (invitation.acceptedAt) {
        throw new Exception('Invitation already accepted', {
          status: 409,
          code: 'E_INVITATION_ACCEPTED',
        })
      }
      if (!invitation.revokedAt) {
        invitation.revokedAt = DateTime.utc()
        await invitation.save()
      }
    })
  }
}
