import { createHash, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMember from '#models/organization_member'
import Invitation from '#models/invitation'
import AuthService from '#services/auth_service'
import InvitationService from '#services/invitation_service'

async function createUser(username: string) {
  return User.create({ username, phone: null, fullName: 'Test User', password: 'Password123!' })
}

async function createOrganizer(username: string) {
  const session = await new AuthService().register({
    accountType: 'organizer',
    username,
    fullName: 'Organizer',
    password: 'Password123!',
  })
  return {
    user: session.user,
    organization: await Organization.findByOrFail('ownerId', session.user.id),
  }
}

test.group('Authentication and organization membership', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('organizers register themselves with one organization and organizer membership', async ({
    client,
    assert,
  }) => {
    const response = await client.request('/api/v1/users', 'POST').json({
      accountType: 'organizer',
      organizationName: 'My committees',
      username: 'owner',
      fullName: 'Owner',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
      ownerId: 9999,
      role: 'admin',
    })
    response.assertStatus(201)
    const { user, token } = response.body().data
    assert.notProperty(user, 'password')
    assert.notProperty(user, 'email')
    const organization = await Organization.findByOrFail('ownerId', user.id)
    assert.equal(organization.name, 'My committees')
    const membership = await OrganizationMember.findByOrFail('userId', user.id)
    assert.equal(membership.organizationId, organization.id)
    assert.equal(membership.role, 'organizer')
    const current = await client.request('/api/v1/organization', 'GET').bearerToken(token)
    current.assertStatus(200)
    assert.equal(current.body().data.id, organization.id)
    const removed = await client
      .request('/api/v1/organizations', 'POST')
      .bearerToken(token)
      .json({ name: 'Extra' })
    removed.assertStatus(404)
    await assert.rejects(() =>
      Organization.create({ id: randomUUID(), ownerId: user.id, name: 'Extra' })
    )
    const stored = await db.from('auth_access_tokens').firstOrFail()
    assert.isAbove(new Date(stored.expires_at).getTime(), Date.now())
    assert.isBelow(new Date(stored.expires_at).getTime(), Date.now() + 31 * 86400000)
  })

  test('signup requires a unique username or phone and validates passwords', async ({
    client,
    assert,
  }) => {
    const input = {
      accountType: 'member',
      fullName: null,
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
    }
    const missing = await client.request('/api/v1/users', 'POST').json(input)
    missing.assertStatus(422)
    const invalid = await client
      .request('/api/v1/users', 'POST')
      .json({ ...input, username: 'user', passwordConfirmation: 'wrong' })
    invalid.assertStatus(422)
    assert.isNull(await User.query().first())
    const phone = await client
      .request('/api/v1/users', 'POST')
      .json({ ...input, phone: '03001234567' })
    phone.assertStatus(201)
    assert.equal(phone.body().data.user.phone, '+923001234567')
    assert.isNull(phone.body().data.user.username)
    assert.isNull(await Organization.query().first())
    const duplicate = await client
      .request('/api/v1/users', 'POST')
      .json({ ...input, phone: '+923001234567' })
    duplicate.assertStatus(422)
    const localDuplicate = await client
      .request('/api/v1/users', 'POST')
      .json({ ...input, phone: '03001234567' })
    localDuplicate.assertStatus(422)
    await assert.rejects(() =>
      User.create({ username: null, phone: null, fullName: null, password: 'Password123!' })
    )
  })

  test('the same login accepts username or phone and logout revokes only its token', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      username: 'ahmed',
      phone: '+923001234567',
      fullName: 'Ahmed',
      password: 'Password123!',
    })
    const usernameLogin = await client
      .request('/api/v1/sessions', 'POST')
      .json({ identifier: 'ahmed', password: 'Password123!' })
    usernameLogin.assertStatus(201)
    const phoneLogin = await client
      .request('/api/v1/sessions', 'POST')
      .json({ identifier: '03001234567', password: 'Password123!' })
    phoneLogin.assertStatus(201)
    assert.equal(phoneLogin.body().data.user.id, user.id)
    const bad = await client
      .request('/api/v1/sessions', 'POST')
      .json({ identifier: 'ahmed', password: 'incorrect' })
    bad.assertStatus(400)
    const token = usernameLogin.body().data.token
    const logout = await client.request('/api/v1/sessions/current', 'DELETE').bearerToken(token)
    logout.assertStatus(204)
    const denied = await client.request('/api/v1/users/me', 'GET').bearerToken(token)
    denied.assertStatus(401)
    const otherSession = await client
      .request('/api/v1/users/me', 'GET')
      .bearerToken(phoneLogin.body().data.token)
    otherSession.assertStatus(200)
    assert.notProperty(otherSession.body().data, 'password')
    await db.from('auth_access_tokens').update({ expires_at: new Date(Date.now() - 1000) })
    const expired = await client
      .request('/api/v1/users/me', 'GET')
      .bearerToken(phoneLogin.body().data.token)
    expired.assertStatus(401)
  })

  test('failed organizer setup rolls back registration', async ({ assert }) => {
    await assert.rejects(() =>
      new AuthService().register({
        accountType: 'organizer',
        username: 'owner',
        organizationName: 'x'.repeat(121),
        fullName: 'Owner',
        password: 'Password123!',
      })
    )
    assert.isNull(await User.findBy('username', 'owner'))
    assert.isNull(await Organization.query().first())
  })

  test('member lists are scoped to the signed-in organizer', async ({ client, assert }) => {
    const first = await createOrganizer('first')
    const second = await createOrganizer('second')
    const regular = await createUser('regular')
    const service = await app.container.make(InvitationService)
    const invite = await service.create(first.organization, first.user.id, regular.username!)
    await service.accept(regular, invite.token)
    const firstList = await client
      .request('/api/v1/organization/members', 'GET')
      .loginAs(first.user)
    firstList.assertStatus(200)
    assert.lengthOf(firstList.body().data, 2)
    const secondList = await client
      .request('/api/v1/organization/members', 'GET')
      .loginAs(second.user)
      .qs({ organizationId: first.organization.id })
    secondList.assertStatus(200)
    assert.lengthOf(secondList.body().data, 1)
    assert.equal(secondList.body().data[0].user.id, second.user.id)
    assert.notInclude(JSON.stringify(secondList.body()), regular.username!)
    const denied = await client.request('/api/v1/organization/members', 'GET').loginAs(regular)
    denied.assertStatus(404)
    const invalidPage = await client
      .request('/api/v1/organization/members', 'GET')
      .loginAs(first.user)
      .qs({ page: 0 })
    invalidPage.assertStatus(422)
  })

  test('organization actions require an organizer membership even for the owner', async ({
    client,
    assert,
  }) => {
    const owner = await createOrganizer('owner')
    const membership = await OrganizationMember.findByOrFail('userId', owner.user.id)
    membership.role = 'member'
    await membership.save()

    for (const missingMembership of [false, true]) {
      if (missingMembership) {
        await membership.delete()
      }
      const organization = await client.request('/api/v1/organization', 'GET').loginAs(owner.user)
      organization.assertStatus(404)
      const members = await client
        .request('/api/v1/organization/members', 'GET')
        .loginAs(owner.user)
      members.assertStatus(404)
      const invitation = await client
        .request('/api/v1/organization/invitations', 'POST')
        .loginAs(owner.user)
        .json({ identifier: 'recipient' })
      invitation.assertStatus(404)
      const revoke = await client
        .request(`/api/v1/organization/invitations/${randomUUID()}`, 'DELETE')
        .loginAs(owner.user)
      revoke.assertStatus(404)
    }
    assert.isNull(await Invitation.query().first())
  })

  test('invitations can precede signup and always grant member role to the intended login', async ({
    client,
    assert,
  }) => {
    const owner = await createOrganizer('owner')
    const issued = await client
      .request('/api/v1/organization/invitations', 'POST')
      .loginAs(owner.user)
      .json({ identifier: '03001234567', role: 'organizer' })
    issued.assertStatus(201)
    const invitation = await Invitation.findOrFail(issued.body().data.id)
    const token = issued.body().data.token
    assert.equal(invitation.recipientIdentifier, '+923001234567')
    assert.equal(invitation.tokenHash, createHash('sha256').update(token).digest('hex'))
    assert.notProperty(invitation.serialize(), 'tokenHash')
    const stranger = await createUser('stranger')
    const denied = await client
      .request('/api/v1/memberships', 'POST')
      .loginAs(stranger)
      .json({ token })
    denied.assertStatus(409)
    const signup = await client.request('/api/v1/users', 'POST').json({
      accountType: 'member',
      phone: '03001234567',
      fullName: 'Ahmed',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
    })
    signup.assertStatus(201)
    const accepted = await client
      .request('/api/v1/memberships', 'POST')
      .bearerToken(signup.body().data.token)
      .json({ token, role: 'organizer', userId: owner.user.id })
    accepted.assertStatus(201)
    assert.equal(accepted.body().data.role, 'member')
    assert.equal(accepted.body().data.userId, signup.body().data.user.id)
    const replay = await client
      .request('/api/v1/memberships', 'POST')
      .bearerToken(signup.body().data.token)
      .json({ token })
    replay.assertStatus(409)
    await invitation.refresh()
    assert.equal(invitation.acceptedBy, signup.body().data.user.id)
    const memberships = await client
      .request('/api/v1/memberships', 'GET')
      .bearerToken(signup.body().data.token)
    memberships.assertStatus(200)
    assert.lengthOf(memberships.body().data, 1)
    assert.equal(memberships.body().data[0].organization.id, owner.organization.id)
    const strangerMemberships = await client.request('/api/v1/memberships', 'GET').loginAs(stranger)
    assert.deepEqual(strangerMemberships.body().data, [])
  })

  test('only the inviting organizer can revoke and revoked invitations cannot be used', async ({
    client,
  }) => {
    const first = await createOrganizer('first')
    const second = await createOrganizer('second')
    const user = await createUser('member')
    const service = await app.container.make(InvitationService)
    const invite = await service.create(first.organization, first.user.id, user.username!)
    const path = `/api/v1/organization/invitations/${invite.id}`
    const denied = await client.request(path, 'DELETE').loginAs(second.user)
    denied.assertStatus(404)
    const revoked = await client.request(path, 'DELETE').loginAs(first.user)
    revoked.assertStatus(204)
    const repeat = await client.request(path, 'DELETE').loginAs(first.user)
    repeat.assertStatus(204)
    const accepted = await client
      .request('/api/v1/memberships', 'POST')
      .loginAs(user)
      .json({ token: invite.token })
    accepted.assertStatus(409)
  })

  test('expired, replaced, and malformed invitations cannot grant membership', async ({
    client,
    assert,
  }) => {
    const owner = await createOrganizer('owner')
    const user = await createUser('member')
    const service = await app.container.make(InvitationService)
    const old = await service.create(owner.organization, owner.user.id, user.username!)
    const current = await service.create(owner.organization, owner.user.id, user.username!)
    const replaced = await client
      .request('/api/v1/memberships', 'POST')
      .loginAs(user)
      .json({ token: old.token })
    replaced.assertStatus(409)
    await Invitation.query()
      .where('id', current.id)
      .update({ expiresAt: DateTime.utc().minus({ minutes: 1 }) })
    const expired = await client
      .request('/api/v1/memberships', 'POST')
      .loginAs(user)
      .json({ token: current.token })
    expired.assertStatus(409)
    const malformed = await client
      .request('/api/v1/memberships', 'POST')
      .loginAs(user)
      .json({ token: 'bad' })
    malformed.assertStatus(422)
    assert.isNull(await OrganizationMember.findBy('userId', user.id))
  })

  test('concurrent acceptance creates exactly one membership', async ({ client, assert }) => {
    const owner = await createOrganizer('owner')
    const user = await createUser('member')
    const service = await app.container.make(InvitationService)
    const invite = await service.create(owner.organization, owner.user.id, user.username!)
    const responses = await Promise.all([
      client.request('/api/v1/memberships', 'POST').loginAs(user).json({ token: invite.token }),
      client.request('/api/v1/memberships', 'POST').loginAs(user).json({ token: invite.token }),
    ])
    assert.deepEqual(responses.map((response) => response.status()).sort(), [201, 409])
    assert.lengthOf(await OrganizationMember.query().where('user_id', user.id), 1)
    const duplicate = await client
      .request('/api/v1/organization/invitations', 'POST')
      .loginAs(owner.user)
      .json({ identifier: user.username })
    duplicate.assertStatus(409)
  })

  test('roles belong to memberships and a user can organize and participate elsewhere', async ({
    client,
    assert,
  }) => {
    const first = await createOrganizer('first')
    const second = await createOrganizer('second')
    const third = await createOrganizer('third')
    const service = await app.container.make(InvitationService)
    for (const organizer of [second, third]) {
      const invitation = await service.create(
        organizer.organization,
        organizer.user.id,
        first.user.username!
      )
      await service.accept(first.user, invitation.token)
    }
    const response = await client.request('/api/v1/memberships', 'GET').loginAs(first.user)
    response.assertStatus(200)
    assert.lengthOf(response.body().data, 3)
    assert.deepEqual(
      response
        .body()
        .data.map((row: { role: string }) => row.role)
        .sort(),
      ['member', 'member', 'organizer']
    )
    const current = await client.request('/api/v1/organization', 'GET').loginAs(first.user)
    assert.equal(current.body().data.id, first.organization.id)
  })
})
