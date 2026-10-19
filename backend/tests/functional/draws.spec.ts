import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import AuthService from '#services/auth_service'
import CommitteeService from '#services/committee_service'
import CommitteeScheduleService from '#services/committee_schedule_service'
import CommitteeMemberService from '#services/committee_member_service'
import CommitteeDrawService from '#services/committee_draw_service'
import CommitteeContributionService from '#services/committee_contribution_service'
import CommitteePayoutPaymentService from '#services/committee_payout_payment_service'
import CommitteeDraw from '#models/committee_draw'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'
import Organization from '#models/organization'
import OrganizationMember from '#models/organization_member'

const base = '/api/v1/organization/committees'
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
    membership: await OrganizationMember.findByOrFail('userId', user.id),
  }
}
async function setup(
  owner: Awaited<ReturnType<typeof organizer>>,
  changes: {
    slots?: number
    allowOverdue?: boolean
    active?: boolean
    fixed?: boolean
  } = {}
) {
  const committee = await new CommitteeService(new CommitteeScheduleService()).create(
    owner.organization,
    {
      name: 'Family draw',
      contributionAmount: '100.00',
      slotCount: changes.slots ?? 3,
      selectionType: changes.fixed ? 'fixed' : 'draw',
      frequency: 'monthly',
      firstDueDate: '2026-01-31',
      overdueDrawAllowed: changes.fixed ? null : (changes.allowOverdue ?? false),
    }
  )
  const slots = await CommitteeMember.query()
    .where('committee_id', committee.id)
    .orderBy('slot_number')
  await new CommitteeMemberService().update(
    committee,
    slots.map((slot) => ({
      slotNumber: slot.slotNumber,
      organizationMemberId: owner.membership.id,
    }))
  )
  if (changes.active !== false) await new CommitteeScheduleService().activate(committee)
  const payouts = await CommitteePayout.query()
    .where('committee_id', committee.id)
    .orderBy('round_number')
  return {
    committee,
    slots,
    payouts,
    path: (index = 0) => `${base}/${committee.id}/payouts/${payouts[index].id}/draw`,
  }
}
const input = () => ({ requestId: randomUUID(), drawnOn: '2026-01-15' })
async function contribute(
  owner: Awaited<ReturnType<typeof organizer>>,
  fixture: Awaited<ReturnType<typeof setup>>,
  slot: number,
  round = 0,
  amount = '100.00',
  paidOn = '2026-01-31'
) {
  return new CommitteeContributionService().create(
    fixture.committee,
    {
      committeeMemberId: fixture.slots[slot].id,
      payoutId: fixture.payouts[round].id,
      requestId: randomUUID(),
      amount,
      paidOn,
      paymentMethod: 'cash',
    },
    owner.user.id
  )
}

test.group('Lucky draw execution', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('a server draw snapshots eligible slots, finalizes one recipient, and enables a separate handover', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const body = input()
    const response = await client
      .request(fixture.path(), 'POST')
      .loginAs(owner.user)
      .json({
        ...body,
        committeeMemberId: randomUUID(),
        recordedBy: 2147483647,
        method: 'automatic',
        eligibleSlots: [],
        overdueDrawAllowed: true,
      })
    response.assertStatus(201)
    const draw = response.body().data
    assert.lengthOf(draw.eligibleSlots, 3)
    assert.deepEqual(
      draw.eligibleSlots.map((slot: { committeeMemberId: string }) => slot.committeeMemberId),
      fixture.slots.map((slot) => slot.id)
    )
    assert.include(
      fixture.slots.map((slot) => slot.id),
      draw.committeeMemberId
    )
    assert.strictEqual(draw.method, 'random')
    assert.strictEqual(draw.overdueDrawAllowed, false)
    assert.strictEqual(draw.recordedBy, owner.user.id)
    assert.strictEqual(draw.drawnOn, body.drawnOn)
    assert.strictEqual(DateTime.fromISO(draw.createdAt, { setZone: true }).offset, 0)
    const round = await CommitteePayout.findOrFail(fixture.payouts[0].id)
    assert.strictEqual(round.committeeMemberId, draw.committeeMemberId)
    assert.strictEqual(round.selectedAt!.toMillis(), DateTime.fromISO(draw.createdAt).toMillis())
    assert.strictEqual(round.status, 'selected')
    assert.strictEqual(round.paidAmount, '0.00')
    const saved = await client.request(fixture.path(), 'GET').loginAs(owner.user)
    saved.assertStatus(200)
    assert.deepEqual(saved.body().data, draw)
    const handover = await new CommitteePayoutPaymentService().create(
      fixture.committee,
      round,
      {
        requestId: randomUUID(),
        amount: '300.00',
        paidOn: '2026-01-15',
        paymentMethod: 'cash',
      },
      owner.user.id
    )
    assert.strictEqual(handover.payment.organizationMemberId, owner.membership.id)
    await round.refresh()
    assert.strictEqual(round.status, 'paid')
    const retry = await client.request(fixture.path(), 'POST').loginAs(owner.user).json(body)
    retry.assertStatus(200)
    assert.deepEqual(retry.body().data, draw)
    const reroll = await client.request(fixture.path(), 'POST').loginAs(owner.user).json(input())
    reroll.assertStatus(409)
    const changed = await client
      .request(fixture.path(), 'POST')
      .loginAs(owner.user)
      .json({ ...body, drawnOn: '2026-01-16' })
    changed.assertStatus(409)
    assert.lengthOf(await CommitteeDraw.query(), 1)
  })

  test('selection is per slot, permits any round and day, and automatically selects the final eligible slot', async ({
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const service = new CommitteeDrawService()
    const winners = new Set<string>()
    for (const [position, roundIndex] of [2, 0, 1].entries()) {
      const result = await service.create(
        fixture.committee,
        fixture.payouts[roundIndex],
        input(),
        owner.user.id
      )
      assert.lengthOf(result.draw.eligibleSlots, 3 - position)
      assert.isTrue(
        result.draw.eligibleSlots.every((slot) => slot.organizationMemberId === owner.membership.id)
      )
      assert.isFalse(winners.has(result.draw.committeeMemberId))
      assert.strictEqual(result.draw.method, position === 2 ? 'automatic' : 'random')
      winners.add(result.draw.committeeMemberId)
    }
    assert.strictEqual(winners.size, 3)
  })

  test('overdue eligibility uses the chosen day, ignores future-round credits and later-dated receipts, and preserves history', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner, { slots: 4 })
    await contribute(owner, fixture, 0)
    await contribute(owner, fixture, 1, 0, '99.99')
    await contribute(owner, fixture, 2, 0, '100.00', '2026-02-16')
    await contribute(owner, fixture, 3, 1, '100.00', '2026-02-01')
    const body = { requestId: randomUUID(), drawnOn: '2026-02-15' }
    const response = await client.request(fixture.path(2), 'POST').loginAs(owner.user).json(body)
    response.assertStatus(201)
    assert.strictEqual(response.body().data.committeeMemberId, fixture.slots[0].id)
    assert.strictEqual(response.body().data.method, 'automatic')
    assert.lengthOf(response.body().data.eligibleSlots, 1)
    await contribute(owner, fixture, 1, 0, '0.01', '2026-02-14')
    const saved = await client.request(fixture.path(2), 'GET').loginAs(owner.user)
    assert.deepEqual(saved.body().data, response.body().data)
    const service = new CommitteeDrawService()
    const second = await service.create(
      fixture.committee,
      fixture.payouts[0],
      { ...body, requestId: randomUUID() },
      owner.user.id
    )
    assert.strictEqual(second.draw.committeeMemberId, fixture.slots[1].id)
    const third = await service.create(
      fixture.committee,
      fixture.payouts[1],
      { requestId: randomUUID(), drawnOn: '2026-02-16' },
      owner.user.id
    )
    assert.strictEqual(third.draw.committeeMemberId, fixture.slots[2].id)
  })

  test('no eligible slots leaves the round unchanged, while the allowed-overdue rule includes unpaid slots', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const body = { requestId: randomUUID(), drawnOn: '2026-02-01' }
    const blocked = await client.request(fixture.path(), 'POST').loginAs(owner.user).json(body)
    blocked.assertStatus(409)
    assert.lengthOf(await CommitteeDraw.query(), 0)
    await fixture.payouts[0].refresh()
    assert.isNull(fixture.payouts[0].committeeMemberId)
    assert.strictEqual(fixture.payouts[0].status, 'scheduled')
    await contribute(owner, fixture, 0, 0, '99.99')
    const partial = await client.request(fixture.path(), 'POST').loginAs(owner.user).json(body)
    partial.assertStatus(409)
    await contribute(owner, fixture, 0, 0, '0.01')
    const resolved = await client.request(fixture.path(), 'POST').loginAs(owner.user).json(body)
    resolved.assertStatus(201)
    assert.strictEqual(resolved.body().data.committeeMemberId, fixture.slots[0].id)
    const allowed = await setup(owner, { allowOverdue: true })
    const result = await client
      .request(allowed.path(), 'POST')
      .loginAs(owner.user)
      .json({ requestId: randomUUID(), drawnOn: '2026-04-15' })
    result.assertStatus(201)
    assert.lengthOf(result.body().data.eligibleSlots, 3)
    assert.strictEqual(result.body().data.overdueDrawAllowed, true)
  })

  test('concurrent retries and different requests cannot redraw a round or select one slot twice', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner, { slots: 4 })
    const body = input()
    const same = await Promise.all(
      [0, 1].map(() => client.request(fixture.path(), 'POST').loginAs(owner.user).json(body))
    )
    assert.deepEqual(same.map((response) => response.status()).sort(), [200, 201])
    assert.strictEqual(same[0].body().data.id, same[1].body().data.id)
    const different = await Promise.all(
      [0, 1].map(() => client.request(fixture.path(1), 'POST').loginAs(owner.user).json(input()))
    )
    assert.deepEqual(different.map((response) => response.status()).sort(), [201, 409])
    const rounds = await Promise.all(
      [2, 3].map((index) =>
        client.request(fixture.path(index), 'POST').loginAs(owner.user).json(input())
      )
    )
    for (const response of rounds) response.assertStatus(201)
    const draws = await CommitteeDraw.query()
    assert.lengthOf(draws, 4)
    assert.strictEqual(new Set(draws.map((draw) => draw.committeeMemberId)).size, 4)
    assert.strictEqual(draws.filter((draw) => draw.method === 'automatic').length, 1)
  })

  test('draw request IDs cannot be shared across rounds or concurrent committees in one organization', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const first = await setup(owner)
    const second = await setup(owner)
    const body = input()
    const responses = await Promise.all(
      [first, second].map((fixture) =>
        client.request(fixture.path(), 'POST').loginAs(owner.user).json(body)
      )
    )
    assert.deepEqual(responses.map((response) => response.status()).sort(), [201, 409])
    const winner = responses[0].status() === 201 ? first : second
    const otherRound = await client.request(winner.path(1), 'POST').loginAs(owner.user).json(body)
    otherRound.assertStatus(409)
    const otherOwner = await organizer('other')
    const foreign = await setup(otherOwner)
    const independent = await client
      .request(foreign.path(), 'POST')
      .loginAs(otherOwner.user)
      .json(body)
    independent.assertStatus(201)
    assert.lengthOf(await CommitteeDraw.query(), 2)
  })

  test('draws validate inputs, require active draw committees, and enforce organizer and resource scope', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const absent = await client.request(fixture.path(), 'GET').loginAs(owner.user)
    absent.assertStatus(404)
    for (const body of [
      {},
      { ...input(), requestId: 'bad' },
      { ...input(), drawnOn: '2026-02-30' },
      { ...input(), drawnOn: '2026-01-01T00:00:00Z' },
      { ...input(), drawnOn: null },
    ]) {
      const response = await client.request(fixture.path(), 'POST').loginAs(owner.user).json(body)
      response.assertStatus(422)
    }
    for (const method of ['GET', 'POST']) {
      const response = await client.request(fixture.path(), method).json(input())
      response.assertStatus(401)
    }
    for (const changes of [{ active: false }, { fixed: true }]) {
      const blocked = await setup(owner, changes)
      const response = await client
        .request(blocked.path(), 'POST')
        .loginAs(owner.user)
        .json(input())
      response.assertStatus(409)
    }
    const other = await organizer('other')
    const otherCommittee = await setup(owner)
    for (const method of ['GET', 'POST']) {
      const unauthorized = await client
        .request(fixture.path(), method)
        .loginAs(other.user)
        .json(input())
      unauthorized.assertStatus(404)
      const foreign = await client
        .request(
          `${base}/${fixture.committee.id}/payouts/${otherCommittee.payouts[0].id}/draw`,
          method
        )
        .loginAs(owner.user)
        .json(input())
      foreign.assertStatus(404)
    }
    owner.membership.role = 'member'
    await owner.membership.save()
    for (const method of ['GET', 'POST']) {
      const denied = await client.request(fixture.path(), method).loginAs(owner.user).json(input())
      denied.assertStatus(404)
    }
    assert.lengthOf(await CommitteeDraw.query(), 0)
  })

  test('failed writes roll back and database constraints reject foreign winners or inconsistent snapshots', async ({
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const service = new CommitteeDrawService()
    await assert.rejects(() =>
      service.create(fixture.committee, fixture.payouts[0], input(), 2147483647)
    )
    assert.lengthOf(await CommitteeDraw.query(), 0)
    await fixture.payouts[0].refresh()
    assert.isNull(fixture.payouts[0].selectedAt)
    assert.isNull(fixture.payouts[0].committeeMemberId)
    const valid = await service.create(
      fixture.committee,
      fixture.payouts[0],
      input(),
      owner.user.id
    )
    const unused = fixture.slots.find((slot) => slot.id !== valid.draw.committeeMemberId)!
    const other = await setup(owner)
    const attributes = {
      organizationId: owner.organization.id,
      committeeId: fixture.committee.id,
      payoutId: fixture.payouts[1].id,
      committeeMemberId: unused.id,
      eligibleSlots: valid.draw.eligibleSlots,
      overdueDrawAllowed: false,
      drawnOn: DateTime.fromISO('2026-01-15', { zone: 'UTC' }),
      method: 'random',
      recordedBy: owner.user.id,
    }
    for (const changes of [
      { committeeMemberId: other.slots[0].id },
      { eligibleSlots: [] },
      {
        eligibleSlots: valid.draw.eligibleSlots.filter(
          (slot) => slot.committeeMemberId !== unused.id
        ),
      },
      { method: 'automatic' },
      { payoutId: other.payouts[0].id },
    ]) {
      await assert.rejects(() =>
        CommitteeDraw.create({
          ...attributes,
          ...changes,
          id: randomUUID(),
          requestId: randomUUID(),
        })
      )
    }
    assert.lengthOf(await CommitteeDraw.query(), 1)
    await fixture.payouts[1].refresh()
    assert.isNull(fixture.payouts[1].committeeMemberId)
  })
})
