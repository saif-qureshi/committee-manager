import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import AuthService from '#services/auth_service'
import InvitationService from '#services/invitation_service'
import MembershipService from '#services/membership_service'
import Organization from '#models/organization'
import OrganizationMember from '#models/organization_member'
import User from '#models/user'
import Invitation from '#models/invitation'

const person = { fullName: 'Ahmed', phone: '+923001234567' }
async function organizer(username = 'owner') {
  const { user } = await new AuthService().register({
    accountType: 'organizer',
    username,
    fullName: 'Organizer',
    password: 'Password123!',
  })
  return { user, organization: await Organization.findByOrFail('ownerId', user.id) }
}

test.group('Pending member accounts', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('adding a member creates a required user link with a hashed temporary password and no login access', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const response = await client
      .request('/api/v1/organization/members', 'POST')
      .loginAs(owner.user)
      .json({ ...person, phone: '03001234567', role: 'organizer', organizationId: randomUUID() })
    response.assertStatus(201)
    assert.equal(response.body().data.role, 'member')
    assert.equal(response.body().data.phone, person.phone)
    assert.notProperty(response.body().data.user, 'password')
    const member = await OrganizationMember.findOrFail(response.body().data.id)
    const user = await User.findOrFail(member.userId)
    assert.equal(member.organizationId, owner.organization.id)
    assert.isTrue(user.isPending)
    assert.isTrue(hash.isValidHash(user.password))
    assert.isFalse(await hash.verify(user.password, 'Password123!'))
    user.password = 'KnownTemporary123!'
    await user.save()
    const login = await client
      .request('/api/v1/sessions', 'POST')
      .json({ identifier: person.phone, password: 'KnownTemporary123!' })
    login.assertStatus(401)
    const access = await client.request('/api/v1/users/me', 'GET').loginAs(user)
    access.assertStatus(401)
    const duplicate = await client
      .request('/api/v1/organization/members', 'POST')
      .loginAs(owner.user)
      .json(person)
    duplicate.assertStatus(409)
    const invalid = await client
      .request('/api/v1/organization/members', 'POST')
      .loginAs(owner.user)
      .json({ fullName: '', phone: 'wrong' })
    invalid.assertStatus(422)
  })

  test('concurrent organizers reuse one user and never overwrite an existing account password', async ({
    assert,
  }) => {
    const first = await organizer('first')
    const second = await organizer('second')
    const [a, b] = await Promise.all([
      new MembershipService().create(first.organization, person),
      new MembershipService().create(second.organization, person),
    ])
    assert.equal(a.userId, b.userId)
    const user = await User.findOrFail(a.userId)
    user.merge({ password: 'ExistingPassword123!', isPending: false })
    await user.save()
    const third = await organizer('third')
    const linked = await new MembershipService().create(third.organization, {
      ...person,
      fullName: 'Different name',
    })
    assert.equal(linked.userId, user.id)
    await user.refresh()
    assert.equal(user.fullName, person.fullName)
    assert.isFalse(user.isPending)
    assert.isTrue(await hash.verify(user.password, 'ExistingPassword123!'))
  })

  test('an invitation claim preserves member and financial identity, sets the chosen password, and cannot be replayed', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const member = await new MembershipService().create(owner.organization, person)
    const committee = await client
      .request('/api/v1/organization/committees', 'POST')
      .loginAs(owner.user)
      .json({
        name: 'Family',
        contributionAmount: '100.00',
        slotCount: 1,
        selectionType: 'fixed',
        frequency: 'monthly',
        firstDueDate: '2026-01-01',
        overdueDrawAllowed: null,
      })
    committee.assertStatus(201)
    const path = `/api/v1/organization/committees/${committee.body().data.id}`
    const assigned = await client
      .request(`${path}/members`, 'PUT')
      .loginAs(owner.user)
      .json({ members: [{ slotNumber: 1, organizationMemberId: member.id }] })
    assigned.assertStatus(200)
    const activated = await client.request(`${path}/activations`, 'POST').loginAs(owner.user)
    activated.assertStatus(201)
    const payouts = await client.request(`${path}/payouts`, 'GET').loginAs(owner.user)
    const contribution = await client
      .request(`${path}/contributions`, 'POST')
      .loginAs(owner.user)
      .json({
        committeeMemberId: assigned.body().data[0].id,
        payoutId: payouts.body().data[0].id,
        paidOn: '2026-01-01',
        requestId: randomUUID(),
        paymentMethod: 'cash',
      })
    contribution.assertStatus(201)
    const invitation = await new InvitationService().create(
      owner.organization,
      owner.user.id,
      person.phone
    )
    const claim = await client.request('/api/v1/account-claims', 'POST').json({
      token: invitation.token,
      password: 'MyPassword123!',
      passwordConfirmation: 'MyPassword123!',
    })
    claim.assertStatus(201)
    assert.equal(claim.body().data.user.id, member.userId)
    const memberships = await client
      .request('/api/v1/memberships', 'GET')
      .bearerToken(claim.body().data.token)
    memberships.assertStatus(200)
    assert.equal(memberships.body().data[0].id, member.id)
    const dues = await client
      .request(`${path}/dues`, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-01-02' })
    dues.assertStatus(200)
    assert.equal(dues.body().data[0].organizationMemberId, member.id)
    assert.equal(dues.body().data[0].status, 'paid')
    const replay = await client.request('/api/v1/account-claims', 'POST').json({
      token: invitation.token,
      password: 'Overwrite123!',
      passwordConfirmation: 'Overwrite123!',
    })
    replay.assertStatus(409)
    const user = await User.findOrFail(member.userId)
    assert.isFalse(user.isPending)
    assert.isTrue(await hash.verify(user.password, 'MyPassword123!'))
  })

  test('expired, revoked, malformed, or mismatched claims cannot change a password', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const member = await new MembershipService().create(owner.organization, person)
    const service = new InvitationService()
    const expired = await service.create(owner.organization, owner.user.id, person.phone)
    const row = await Invitation.findOrFail(expired.id)
    row.expiresAt = DateTime.utc().minus({ seconds: 1 })
    await row.save()
    const revoked = await service.create(owner.organization, owner.user.id, person.phone)
    await service.revoke(owner.organization, revoked.id)
    for (const token of [expired.token, revoked.token]) {
      const response = await client
        .request('/api/v1/account-claims', 'POST')
        .json({ token, password: 'NewPassword123!', passwordConfirmation: 'NewPassword123!' })
      response.assertStatus(409)
    }
    const valid = await service.create(owner.organization, owner.user.id, person.phone)
    const mismatch = await client.request('/api/v1/account-claims', 'POST').json({
      token: valid.token,
      password: 'NewPassword123!',
      passwordConfirmation: 'WrongPassword123!',
    })
    mismatch.assertStatus(422)
    const malformed = await client
      .request('/api/v1/account-claims', 'POST')
      .json({ token: 'bad', password: 'NewPassword123!', passwordConfirmation: 'NewPassword123!' })
    malformed.assertStatus(422)
    const unchanged = await User.findOrFail(member.userId)
    assert.isTrue(unchanged.isPending)
  })
})
