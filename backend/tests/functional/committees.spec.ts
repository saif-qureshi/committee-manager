import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import AuthService from '#services/auth_service'
import CommitteeService from '#services/committee_service'
import CommitteeMemberService from '#services/committee_member_service'
import CommitteePayoutService from '#services/committee_payout_service'
import CommitteeScheduleService from '#services/committee_schedule_service'
import Organization from '#models/organization'
import OrganizationMember from '#models/organization_member'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'
import type { CommitteeInput } from '#validators/committee'

const input: CommitteeInput = {
  name: 'Family committee',
  contributionAmount: '10000.00',
  slotCount: 3,
  selectionType: 'fixed',
  frequency: 'monthly',
  firstDueDate: '2028-01-31',
  overdueDrawAllowed: null,
}
const base = '/api/v1/organization/committees'
const committees = () => new CommitteeService(new CommitteeScheduleService())

async function organizer(username = 'owner') {
  const { user } = await new AuthService().register({
    accountType: 'organizer',
    username,
    fullName: 'Organizer',
    password: 'Password123!',
  })
  return {
    user,
    organization: await Organization.findByOrFail('ownerId', user.id),
    member: await OrganizationMember.findByOrFail('userId', user.id),
  }
}

function draft(
  owner: Awaited<ReturnType<typeof organizer>>,
  changes: Partial<CommitteeInput> = {}
) {
  return committees().create(owner.organization, { ...input, ...changes })
}

async function assignments(committeeId: string, organizationMemberId: string) {
  const members = await CommitteeMember.query()
    .where('committee_id', committeeId)
    .orderBy('slot_number')
  return members.map((member) => ({ slotNumber: member.slotNumber, organizationMemberId }))
}

async function turns(committeeId: string) {
  const payouts = await CommitteePayout.query()
    .where('committee_id', committeeId)
    .orderBy('round_number')
  return payouts.map((payout) => ({
    roundNumber: payout.roundNumber,
    committeeMemberId: payout.committeeMemberId,
  }))
}

test.group('Committee setup', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('organizers create scoped drafts with slots and payout turns, using decimal PKR strings', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const other = await organizer('other')
    const created = await client
      .request(base, 'POST')
      .loginAs(owner.user)
      .json({
        ...input,
        name: '  Family committee  ',
        contributionAmount: '10000.5',
        organizationId: other.organization.id,
        status: 'active',
        activatedAt: '2026-01-01',
      })
    created.assertStatus(201)
    const committee = created.body().data
    assert.equal(committee.organizationId, owner.organization.id)
    assert.equal(committee.name, 'Family committee')
    assert.equal(committee.status, 'draft')
    assert.strictEqual(committee.contributionAmount, '10000.50')
    assert.equal(committee.assignedMemberCount, 0)
    const members = await client
      .request(`${base}/${committee.id}/members`, 'GET')
      .loginAs(owner.user)
    members.assertStatus(200)
    assert.deepEqual(
      members.body().data.map((member: { slotNumber: number }) => member.slotNumber),
      [1, 2, 3]
    )
    assert.isNull(members.body().data[0].member)
    const payouts = await client
      .request(`${base}/${committee.id}/payouts`, 'GET')
      .loginAs(owner.user)
    payouts.assertStatus(200)
    assert.equal(payouts.body().data[0].committeeMemberId, members.body().data[0].id)
    assert.strictEqual(payouts.body().data[0].expectedAmount, '30001.50')
    assert.equal(payouts.body().data[0].dueDate, '2028-01-31')
    assert.equal(payouts.body().data[0].status, 'scheduled')
    assert.isNull(payouts.body().data[0].selectedAt)
    const list = await client.request(base, 'GET').loginAs(owner.user)
    assert.lengthOf(list.body().data, 1)
    const empty = await client.request(base, 'GET').loginAs(other.user)
    assert.deepEqual(empty.body().data, [])
    const unauthenticated = await client.request(base, 'GET')
    unauthenticated.assertStatus(401)
    const invalidPage = await client.request(base, 'GET').loginAs(owner.user).qs({ page: 0 })
    invalidPage.assertStatus(422)
    const member = await new AuthService().register({
      accountType: 'member',
      username: 'member',
      fullName: null,
      password: 'Password123!',
    })
    const denied = await client.request(base, 'POST').loginAs(member.user).json(input)
    denied.assertStatus(404)
  })

  test('invalid dates, decimal formats, zero amounts, and slot counts create no partial records', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    for (const changes of [
      { firstDueDate: '2027-02-29' },
      { firstDueDate: '2028-02-30' },
      { firstDueDate: '2028-01-31T00:00:00Z' },
      { firstDueDate: '2101-01-01' },
      ...['0', '0.0', '0.00', '-1', '0.001', '1e3', 'NaN', '10000000000.00', '01.00'].map(
        (contributionAmount) => ({ contributionAmount })
      ),
      { contributionAmount: 0.1 },
      { slotCount: 0 },
      { slotCount: 101 },
      { slotCount: 2.5 },
    ]) {
      const response = await client
        .request(base, 'POST')
        .loginAs(owner.user)
        .json({ ...input, ...changes })
      response.assertStatus(422)
    }
    assert.lengthOf(await db.from('committees'), 0)
    assert.lengthOf(await db.from('committee_members'), 0)
    assert.lengthOf(await db.from('committee_payouts'), 0)
  })

  test('changing slot count or mode requires clearing member assignments, then rebuilds the draft', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const committee = await draft(owner)
    const all = await assignments(committee.id, owner.member.id)
    await new CommitteeMemberService().update(committee, all)
    const blocked = await client
      .request(`${base}/${committee.id}`, 'PUT')
      .loginAs(owner.user)
      .json({ ...input, slotCount: 2, selectionType: 'draw', overdueDrawAllowed: false })
    blocked.assertStatus(409)
    const cleared = await client
      .request(`${base}/${committee.id}/members`, 'PUT')
      .loginAs(owner.user)
      .json({ members: all.map((member) => ({ ...member, organizationMemberId: null })) })
    cleared.assertStatus(200)
    const resized = await client
      .request(`${base}/${committee.id}`, 'PUT')
      .loginAs(owner.user)
      .json({ ...input, slotCount: 2, selectionType: 'draw', overdueDrawAllowed: false })
    resized.assertStatus(200)
    assert.equal(resized.body().data.slotCount, 2)
    const payouts = await CommitteePayout.query().where('committee_id', committee.id)
    assert.lengthOf(payouts, 2)
    assert.isTrue(payouts.every((payout) => payout.committeeMemberId === null))
    const restored = await client
      .request(`${base}/${committee.id}`, 'PUT')
      .loginAs(owner.user)
      .json({ ...input, slotCount: 2 })
    restored.assertStatus(200)
    const fixed = await CommitteePayout.query().where('committee_id', committee.id)
    assert.isTrue(fixed.every((payout) => payout.committeeMemberId !== null))
  })

  test('multiple slots can belong to one member and invalid replacements preserve existing assignments', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const foreign = await organizer('foreign')
    const committee = await draft(owner)
    const all = await assignments(committee.id, owner.member.id)
    const saved = await client
      .request(`${base}/${committee.id}/members`, 'PUT')
      .loginAs(owner.user)
      .json({ members: all })
    saved.assertStatus(200)
    assert.equal(saved.body().data[0].member.user.id, owner.user.id)
    const before = await db
      .from('committee_members')
      .where('committee_id', committee.id)
      .orderBy('slot_number')
    for (const members of [
      all.slice(1),
      [all[0], all[0], all[2]],
      all.map((member) => ({ ...member, slotNumber: member.slotNumber + 1 })),
      all.map((member) => ({ ...member, organizationMemberId: foreign.member.id })),
    ]) {
      const invalid = await client
        .request(`${base}/${committee.id}/members`, 'PUT')
        .loginAs(owner.user)
        .json({ members })
      invalid.assertStatus(422)
      assert.deepEqual(
        await db
          .from('committee_members')
          .where('committee_id', committee.id)
          .orderBy('slot_number'),
        before
      )
    }
    const detail = await client.request(`${base}/${committee.id}`, 'GET').loginAs(owner.user)
    assert.equal(detail.body().data.assignedMemberCount, 3)
    await assert.rejects(() =>
      db
        .from('committee_members')
        .where('id', before[0].id)
        .update({ organization_member_id: foreign.member.id })
    )
  })

  test('payout turns swap safely and reject duplicate or foreign slot recipients atomically', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const committee = await draft(owner)
    const other = await draft(owner)
    const all = await turns(committee.id)
    const foreign = await turns(other.id)
    const before = await db
      .from('committee_payouts')
      .where('committee_id', committee.id)
      .orderBy('round_number')
    for (const payouts of [
      all.slice(1),
      [all[0], all[0], all[2]],
      all.map((payout) => ({ ...payout, committeeMemberId: all[0].committeeMemberId })),
      all.map((payout) => ({ ...payout, committeeMemberId: foreign[0].committeeMemberId })),
      all.map((payout) => ({ ...payout, roundNumber: payout.roundNumber + 1 })),
    ]) {
      const invalid = await client
        .request(`${base}/${committee.id}/payouts`, 'PUT')
        .loginAs(owner.user)
        .json({ payouts })
      invalid.assertStatus(422)
      assert.deepEqual(
        await db
          .from('committee_payouts')
          .where('committee_id', committee.id)
          .orderBy('round_number'),
        before
      )
    }
    const swapped = await client
      .request(`${base}/${committee.id}/payouts`, 'PUT')
      .loginAs(owner.user)
      .json({ payouts: all.map((payout) => ({ ...payout, roundNumber: 4 - payout.roundNumber })) })
    swapped.assertStatus(200)
    assert.deepEqual(
      swapped.body().data.map((payout: { committeeMemberId: string }) => payout.committeeMemberId),
      all.map((payout) => payout.committeeMemberId).reverse()
    )
    await assert.rejects(() =>
      db
        .from('committee_payouts')
        .where('id', before[0].id)
        .update({ committee_member_id: foreign[0].committeeMemberId })
    )
  })

  test('editing amount and dates refreshes payout rows while keeping custom turn assignments', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const committee = await draft(owner)
    const all = await turns(committee.id)
    await new CommitteePayoutService().update(
      committee,
      all.map((payout) => ({ ...payout, roundNumber: 4 - payout.roundNumber }))
    )
    const before = await turns(committee.id)
    const changed = await client
      .request(`${base}/${committee.id}`, 'PUT')
      .loginAs(owner.user)
      .json({
        ...input,
        contributionAmount: '0.10',
        firstDueDate: '2027-12-28',
        frequency: 'weekly',
      })
    changed.assertStatus(200)
    assert.deepEqual(await turns(committee.id), before)
    const payouts = await CommitteePayout.query()
      .where('committee_id', committee.id)
      .orderBy('round_number')
    assert.isTrue(payouts.every((payout) => payout.expectedAmount === '0.30'))
    assert.deepEqual(
      payouts.map((payout) => payout.dueDate.toISODate()),
      ['2027-12-28', '2028-01-04', '2028-01-11']
    )
  })

  test('previews preserve month-end anchors and calendar dates without writing new records', async ({
    assert,
  }) => {
    const owner = await organizer()
    for (const scenario of [
      {
        firstDueDate: '2028-01-31',
        frequency: 'monthly' as const,
        dates: ['2028-01-31', '2028-02-29', '2028-03-31'],
      },
      {
        firstDueDate: '2027-01-30',
        frequency: 'monthly' as const,
        dates: ['2027-01-30', '2027-02-28', '2027-03-30'],
      },
      {
        firstDueDate: '2028-03-05',
        frequency: 'weekly' as const,
        dates: ['2028-03-05', '2028-03-12', '2028-03-19'],
      },
    ]) {
      const committee = await draft(owner, {
        firstDueDate: scenario.firstDueDate,
        frequency: scenario.frequency,
        contributionAmount: '0.10',
      })
      const before = await db
        .from('committee_payouts')
        .where('committee_id', committee.id)
        .orderBy('round_number')
      const schedule = await new CommitteeScheduleService().preview(committee)
      assert.deepEqual(
        schedule.payouts.map((payout) => payout.dueDate),
        scenario.dates
      )
      assert.strictEqual(schedule.totalContributionPerSlot, '0.30')
      assert.isFalse(schedule.readyToActivate)
      assert.deepEqual(
        await db
          .from('committee_payouts')
          .where('committee_id', committee.id)
          .orderBy('round_number'),
        before
      )
    }
  })

  test('activation requires complete setup, is safe on concurrent retries, and locks both assignments and payouts', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const committee = await draft(owner)
    const path = `${base}/${committee.id}`
    const incomplete = await client.request(`${path}/activations`, 'POST').loginAs(owner.user)
    incomplete.assertStatus(409)
    const all = await assignments(committee.id, owner.member.id)
    await new CommitteeMemberService().update(committee, all)
    const recipients = await turns(committee.id)
    await new CommitteePayoutService().update(
      committee,
      recipients.map((payout) => ({ ...payout, committeeMemberId: null }))
    )
    const missing = await client.request(`${path}/activations`, 'POST').loginAs(owner.user)
    missing.assertStatus(409)
    const pendingPayouts = await CommitteePayout.query().where('committee_id', committee.id)
    assert.isTrue(
      pendingPayouts.every((payout) => payout.status === 'scheduled' && payout.selectedAt === null)
    )
    await new CommitteePayoutService().update(committee, recipients)
    const preview = await client.request(`${path}/schedule`, 'GET').loginAs(owner.user)
    assert.isTrue(preview.body().data.readyToActivate)
    const responses = await Promise.all([
      client.request(`${path}/activations`, 'POST').loginAs(owner.user),
      client.request(`${path}/activations`, 'POST').loginAs(owner.user),
    ])
    assert.deepEqual(responses.map((response) => response.status()).sort(), [200, 201])
    assert.equal(responses[0].body().data.status, 'active')
    assert.isNotNull(responses[0].body().data.activatedAt)
    assert.deepEqual(await turns(committee.id), recipients)
    const payouts = await CommitteePayout.query().where('committee_id', committee.id)
    assert.lengthOf(payouts, 3)
    assert.isTrue(
      payouts.every((payout) => payout.status === 'selected' && payout.selectedAt !== null)
    )
    for (const [suffix, body] of [
      ['', input],
      ['/members', { members: all }],
      ['/payouts', { payouts: recipients }],
    ] as const) {
      const locked = await client.request(`${path}${suffix}`, 'PUT').loginAs(owner.user).json(body)
      locked.assertStatus(409)
    }
    const active = await client.request(`${path}/schedule`, 'GET').loginAs(owner.user)
    assert.isFalse(active.body().data.readyToActivate)
  })

  test('draw activation requires an explicit overdue rule and leaves all recipients unselected', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const committee = await draft(owner, { selectionType: 'draw' })
    const path = `${base}/${committee.id}`
    await new CommitteeMemberService().update(
      committee,
      await assignments(committee.id, owner.member.id)
    )
    const members = await CommitteeMember.query()
      .where('committee_id', committee.id)
      .orderBy('slot_number')
    const invalid = await client
      .request(`${path}/payouts`, 'PUT')
      .loginAs(owner.user)
      .json({
        payouts: members.map((member) => ({
          roundNumber: member.slotNumber,
          committeeMemberId: member.id,
        })),
      })
    invalid.assertStatus(422)
    const undecided = await client.request(`${path}/activations`, 'POST').loginAs(owner.user)
    undecided.assertStatus(409)
    const settings = await client
      .request(path, 'PUT')
      .loginAs(owner.user)
      .json({ ...input, selectionType: 'draw', overdueDrawAllowed: false })
    settings.assertStatus(200)
    const activation = await client.request(`${path}/activations`, 'POST').loginAs(owner.user)
    activation.assertStatus(201)
    const payouts = await CommitteePayout.query().where('committee_id', committee.id)
    assert.lengthOf(payouts, 3)
    assert.isTrue(
      payouts.every(
        (payout) =>
          payout.committeeMemberId === null &&
          payout.status === 'scheduled' &&
          payout.selectedAt === null
      )
    )
  })

  test('all committee resources are scoped through the controller organization and Bouncer', async ({
    client,
  }) => {
    const owner = await organizer()
    const other = await organizer('other')
    const committee = await draft(owner)
    const path = `${base}/${committee.id}`
    const members = await assignments(committee.id, owner.member.id)
    const payouts = await turns(committee.id)
    for (const [method, suffix, body] of [
      ['GET', '', {}],
      ['PUT', '', input],
      ['GET', '/members', {}],
      ['PUT', '/members', { members }],
      ['GET', '/payouts', {}],
      ['PUT', '/payouts', { payouts }],
      ['GET', '/schedule', {}],
      ['POST', '/activations', {}],
    ] as const) {
      const response = await client
        .request(`${path}${suffix}`, method)
        .loginAs(other.user)
        .json(body)
      response.assertStatus(404)
    }
    owner.member.role = 'member'
    await owner.member.save()
    for (const [method, url, body] of [
      ['GET', base, {}],
      ['POST', base, input],
      ['PUT', path, input],
      ['POST', `${path}/activations`, {}],
    ] as const) {
      const denied = await client.request(url, method).loginAs(owner.user).json(body)
      denied.assertStatus(404)
    }
    const malformed = await client.request(`${base}/invalid`, 'GET').loginAs(owner.user)
    malformed.assertStatus(422)
  })

  test('activation and member assignment writes serialize to preserve finalized recipients', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const secondUser = await organizer('second')
    const second = await OrganizationMember.create({
      id: randomUUID(),
      organizationId: owner.organization.id,
      userId: secondUser.user.id,
      role: 'member',
    })
    const committee = await draft(owner, { slotCount: 2 })
    const all = await assignments(committee.id, owner.member.id)
    await new CommitteeMemberService().update(committee, all)
    const path = `${base}/${committee.id}`
    const [activation, assignment] = await Promise.all([
      client.request(`${path}/activations`, 'POST').loginAs(owner.user),
      client
        .request(`${path}/members`, 'PUT')
        .loginAs(owner.user)
        .json({ members: all.map((member) => ({ ...member, organizationMemberId: second.id })) }),
    ])
    activation.assertStatus(201)
    assert.include([200, 409], assignment.status())
    const recipients = await db
      .from('committee_payouts')
      .join('committee_members', 'committee_payouts.committee_member_id', 'committee_members.id')
      .select('committee_members.organization_member_id')
    assert.lengthOf(recipients, 2)
    const expected = assignment.status() === 200 ? second.id : owner.member.id
    assert.isTrue(recipients.every((recipient) => recipient.organization_member_id === expected))
  })

  test('maximum decimal amounts stay exact without legacy setup tables', async ({ assert }) => {
    const owner = await organizer()
    const committee = await draft(owner, { slotCount: 100, contributionAmount: '9999999999.99' })
    await new CommitteeMemberService().update(
      committee,
      await assignments(committee.id, owner.member.id)
    )
    await new CommitteeScheduleService().activate(committee)
    const schedule = await new CommitteeScheduleService().preview(committee)
    assert.strictEqual(schedule.totalContributionPerSlot, '999999999999.00')
    assert.lengthOf(schedule.payouts, 100)
    const payout = await db
      .from('committee_payouts')
      .where('committee_id', committee.id)
      .firstOrFail()
    assert.strictEqual(payout.expected_amount, '999999999999.00')
    for (const table of ['shares', 'share_ownerships', 'rounds', 'installments']) {
      assert.isFalse(await db.connection().schema.hasTable(table))
    }
  })
})
