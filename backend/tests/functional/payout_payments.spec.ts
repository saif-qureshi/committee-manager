import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import AuthService from '#services/auth_service'
import CommitteeService from '#services/committee_service'
import CommitteeMemberService from '#services/committee_member_service'
import CommitteeScheduleService from '#services/committee_schedule_service'
import CommitteePayoutPaymentService from '#services/committee_payout_payment_service'
import Organization from '#models/organization'
import OrganizationMember from '#models/organization_member'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'
import CommitteePayoutPayment from '#models/committee_payout_payment'
import type { PayoutPaymentInput } from '#validators/committee_payout_payment'

const base = '/api/v1/organization/committees'
const input = (): PayoutPaymentInput => ({
  requestId: randomUUID(),
  amount: '10.00',
  paidOn: '2026-10-01',
  paymentMethod: 'cash',
})

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
  options: {
    active?: boolean
    draw?: boolean
    amount?: string
    slots?: number
    recipientId?: string
  } = {}
) {
  const committee = await new CommitteeService(new CommitteeScheduleService()).create(
    owner.organization,
    {
      name: 'Monthly committee',
      contributionAmount: options.amount ?? '50.00',
      slotCount: options.slots ?? 2,
      selectionType: options.draw ? 'draw' : 'fixed',
      frequency: 'monthly',
      firstDueDate: '2026-10-01',
      overdueDrawAllowed: options.draw ? false : null,
    }
  )
  const members = await CommitteeMember.query().where('committee_id', committee.id)
  await new CommitteeMemberService().update(
    committee,
    members.map((member) => ({
      slotNumber: member.slotNumber,
      organizationMemberId: options.recipientId ?? owner.membership.id,
    }))
  )
  if (options.active !== false) await new CommitteeScheduleService().activate(committee)
  const payout = await CommitteePayout.query()
    .where('committee_id', committee.id)
    .orderBy('round_number')
    .firstOrFail()
  return { committee, payout, path: `${base}/${committee.id}/payouts/${payout.id}/payments` }
}

test.group('Payout handover recording', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('partial and final handovers preserve history, recipient and actor, and update monthly payout summaries', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const recipient = await new AuthService().register({
      accountType: 'member',
      username: 'recipient',
      fullName: 'Recipient',
      password: 'Password123!',
    })
    const recipientMembership = await OrganizationMember.create({
      id: randomUUID(),
      organizationId: owner.organization.id,
      userId: recipient.user.id,
      role: 'member',
    })
    const { committee, payout, path } = await setup(owner, { recipientId: recipientMembership.id })
    const first = await client
      .request(path, 'POST')
      .loginAs(owner.user)
      .json({
        ...input(),
        amount: '30.2',
        reference: '  receipt-1  ',
        recordedBy: 9999,
        organizationMemberId: randomUUID(),
        status: 'paid',
      })
    first.assertStatus(201)
    assert.strictEqual(first.body().data.amount, '30.20')
    assert.equal(first.body().data.reference, 'receipt-1')
    assert.equal(first.body().data.organizationMemberId, recipientMembership.id)
    assert.equal(first.body().data.recordedBy, owner.user.id)
    assert.equal(first.body().data.paidOn, '2026-10-01')
    assert.equal(DateTime.fromISO(first.body().data.createdAt, { setZone: true }).offset, 0)
    await payout.refresh()
    assert.equal(payout.status, 'partially_paid')
    assert.strictEqual(payout.paidAmount, '30.20')
    assert.isNull(payout.paidAt)
    const partial = await client
      .request(`${base}/${committee.id}/payouts`, 'GET')
      .loginAs(owner.user)
    assert.strictEqual(partial.body().data[0].remainingAmount, '69.80')
    const second = await client
      .request(path, 'POST')
      .loginAs(owner.user)
      .json({
        ...input(),
        amount: '69.80',
        paidOn: '2026-10-02',
        paymentMethod: 'bank_transfer',
        reference: 'bank-2',
      })
    second.assertStatus(201)
    await payout.refresh()
    assert.equal(payout.status, 'paid')
    assert.strictEqual(payout.paidAmount, '100.00')
    assert.isNotNull(payout.paidAt)
    const schedule = await client
      .request(`${base}/${committee.id}/schedule`, 'GET')
      .loginAs(owner.user)
    assert.strictEqual(schedule.body().data.payouts[0].paidAmount, '100.00')
    assert.strictEqual(schedule.body().data.payouts[0].remainingAmount, '0.00')
    assert.equal(schedule.body().data.payouts[0].status, 'paid')
    const history = await client.request(path, 'GET').loginAs(owner.user)
    history.assertStatus(200)
    assert.lengthOf(history.body().data, 2)
    assert.equal(history.body().data[0].reference, 'bank-2')
    await committee.refresh()
    assert.equal(committee.status, 'active')
  })

  test('same request retries return the original record even after full payment, while changed payloads conflict', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const { path, payout } = await setup(owner)
    const payload = { ...input(), amount: '100', reference: null }
    const original = await client.request(path, 'POST').loginAs(owner.user).json(payload)
    original.assertStatus(201)
    const retry = await client
      .request(path, 'POST')
      .loginAs(owner.user)
      .json({ ...payload, amount: '100.00', reference: '' })
    retry.assertStatus(200)
    assert.equal(retry.body().data.id, original.body().data.id)
    for (const change of [
      { amount: '99.99' },
      { paidOn: '2026-10-02' },
      { paymentMethod: 'other' },
      { reference: 'different' },
    ]) {
      const conflict = await client
        .request(path, 'POST')
        .loginAs(owner.user)
        .json({ ...payload, ...change })
      conflict.assertStatus(409)
    }
    const extra = await client.request(path, 'POST').loginAs(owner.user).json(input())
    extra.assertStatus(409)
    assert.lengthOf(await CommitteePayoutPayment.query(), 1)
    await payout.refresh()
    assert.strictEqual(payout.paidAmount, '100.00')
  })

  test('overpayments are rejected and concurrent different requests cannot exceed the remaining amount', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const { path, payout } = await setup(owner)
    const overpaid = await client
      .request(path, 'POST')
      .loginAs(owner.user)
      .json({ ...input(), amount: '100.01' })
    overpaid.assertStatus(409)
    const results = await Promise.all([
      client
        .request(path, 'POST')
        .loginAs(owner.user)
        .json({ ...input(), amount: '60.00' }),
      client
        .request(path, 'POST')
        .loginAs(owner.user)
        .json({ ...input(), amount: '60.00' }),
    ])
    assert.deepEqual(results.map((result) => result.status()).sort(), [201, 409])
    await payout.refresh()
    assert.strictEqual(payout.paidAmount, '60.00')
    const payments = await CommitteePayoutPayment.query()
    assert.lengthOf(payments, 1)
    assert.strictEqual(payments[0].amount, payout.paidAmount)
  })

  test('concurrent retries create exactly one handover and update the total once', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const { path, payout } = await setup(owner)
    const payload = input()
    const results = await Promise.all([
      client.request(path, 'POST').loginAs(owner.user).json(payload),
      client.request(path, 'POST').loginAs(owner.user).json(payload),
    ])
    assert.deepEqual(results.map((result) => result.status()).sort(), [200, 201])
    assert.equal(results[0].body().data.id, results[1].body().data.id)
    await payout.refresh()
    assert.strictEqual(payout.paidAmount, '10.00')
    assert.lengthOf(await CommitteePayoutPayment.query(), 1)
  })

  test('request IDs cannot be reused across different payouts or concurrent committees in the same organization', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const first = await setup(owner)
    const second = await setup(owner)
    const payload = input()
    const results = await Promise.all([
      client.request(first.path, 'POST').loginAs(owner.user).json(payload),
      client.request(second.path, 'POST').loginAs(owner.user).json(payload),
    ])
    assert.deepEqual(results.map((result) => result.status()).sort(), [201, 409])
    assert.lengthOf(await CommitteePayoutPayment.query(), 1)
    const payment = await CommitteePayoutPayment.query().firstOrFail()
    const other = await CommitteePayout.query()
      .where('committee_id', payment.committeeId)
      .whereNot('id', payment.payoutId)
      .firstOrFail()
    const conflict = await client
      .request(`${base}/${payment.committeeId}/payouts/${other.id}/payments`, 'POST')
      .loginAs(owner.user)
      .json(payload)
    conflict.assertStatus(409)
  })

  test('separate organizations may use the same request ID independently', async ({
    client,
    assert,
  }) => {
    const first = await organizer()
    const second = await organizer('second')
    const firstSetup = await setup(first)
    const secondSetup = await setup(second)
    const payload = input()
    const one = await client.request(firstSetup.path, 'POST').loginAs(first.user).json(payload)
    one.assertStatus(201)
    const two = await client.request(secondSetup.path, 'POST').loginAs(second.user).json(payload)
    two.assertStatus(201)
    assert.lengthOf(await CommitteePayoutPayment.query(), 2)
  })

  test('draft committees and unselected draw rounds cannot record payments', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    for (const options of [{ active: false }, { draw: true }]) {
      const { path } = await setup(owner, options)
      const response = await client.request(path, 'POST').loginAs(owner.user).json(input())
      response.assertStatus(409)
    }
    assert.lengthOf(await CommitteePayoutPayment.query(), 0)
    const draw = await setup(owner, { draw: true })
    const slot = await CommitteeMember.query()
      .where('committee_id', draw.committee.id)
      .firstOrFail()
    draw.payout.merge({
      committeeMemberId: slot.id,
      status: 'selected',
      selectedAt: DateTime.utc(),
    })
    await draw.payout.save()
    const selected = await client.request(draw.path, 'POST').loginAs(owner.user).json(input())
    selected.assertStatus(201)
  })

  test('invalid amounts, dates, payment details, and request IDs leave totals and history unchanged', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const { path, payout } = await setup(owner)
    for (const change of [
      ...['0', '0.00', '-1', '0.001', '1e2', '1000000000000.00'].map((amount) => ({ amount })),
      { amount: 1.25 },
      { paidOn: '2026-02-30' },
      { paidOn: '2026-10-01T00:00:00Z' },
      { paidOn: '2101-01-01' },
      { paymentMethod: 'unknown' },
      { reference: 'x'.repeat(121) },
      { requestId: 'invalid' },
      { requestId: null },
    ]) {
      const response = await client
        .request(path, 'POST')
        .loginAs(owner.user)
        .json({ ...input(), ...change })
      assert.equal(response.status(), 422, JSON.stringify(change))
    }
    assert.lengthOf(await CommitteePayoutPayment.query(), 0)
    await payout.refresh()
    assert.strictEqual(payout.paidAmount, '0.00')
    assert.equal(payout.status, 'selected')
  })

  test('payment history and writes are scoped to the owning organizer and the requested committee', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const outsider = await organizer('outsider')
    const first = await setup(owner)
    const second = await setup(owner)
    const paid = await client.request(first.path, 'POST').loginAs(owner.user).json(input())
    paid.assertStatus(201)
    for (const method of ['GET', 'POST'] as const) {
      const foreign = await client.request(first.path, method).loginAs(outsider.user).json(input())
      foreign.assertStatus(404)
      const mismatched = await client
        .request(`${base}/${second.committee.id}/payouts/${first.payout.id}/payments`, method)
        .loginAs(owner.user)
        .json(input())
      mismatched.assertStatus(404)
    }
    const unauthenticated = await client.request(first.path, 'GET')
    unauthenticated.assertStatus(401)
    const invalidPage = await client.request(first.path, 'GET').loginAs(owner.user).qs({ page: 0 })
    invalidPage.assertStatus(422)
    const malformed = await client
      .request(`${base}/${first.committee.id}/payouts/invalid/payments`, 'GET')
      .loginAs(owner.user)
    malformed.assertStatus(422)
    owner.membership.role = 'member'
    await owner.membership.save()
    const deniedRead = await client.request(first.path, 'GET').loginAs(owner.user)
    deniedRead.assertStatus(404)
    const deniedWrite = await client.request(first.path, 'POST').loginAs(owner.user).json(input())
    deniedWrite.assertStatus(404)
    assert.lengthOf(await CommitteePayoutPayment.query(), 1)
  })

  test('history paginates and payout totals equal the exact sum of handovers', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const { committee, payout, path } = await setup(owner)
    const service = new CommitteePayoutPaymentService()
    for (let index = 0; index < 26; index++) {
      await service.create(
        committee,
        payout,
        { ...input(), amount: '0.10', reference: `receipt-${index}` },
        owner.user.id
      )
    }
    const first = await client.request(path, 'GET').loginAs(owner.user)
    first.assertStatus(200)
    assert.lengthOf(first.body().data, 25)
    const second = await client.request(path, 'GET').loginAs(owner.user).qs({ page: 2 })
    second.assertStatus(200)
    assert.lengthOf(second.body().data, 1)
    await payout.refresh()
    assert.strictEqual(payout.paidAmount, '2.60')
    const sum = await db
      .from('committee_payout_payments')
      .where('payout_id', payout.id)
      .sum('amount as total')
      .firstOrFail()
    assert.strictEqual(sum.total, payout.paidAmount)
  })

  test('maximum payout amounts stay exact and fully paid totals satisfy database constraints', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const { path, payout } = await setup(owner, { amount: '9999999999.99', slots: 100 })
    const response = await client
      .request(path, 'POST')
      .loginAs(owner.user)
      .json({ ...input(), amount: '999999999999.00' })
    response.assertStatus(201)
    assert.strictEqual(response.body().data.amount, '999999999999.00')
    await payout.refresh()
    assert.strictEqual(payout.paidAmount, '999999999999.00')
    assert.equal(payout.status, 'paid')
    await assert.rejects(() =>
      db.from('committee_payouts').where('id', payout.id).update({ paid_amount: '999999999999.01' })
    )
  })

  test('recording stops on mismatched history totals and failed inserts never advance payout state', async ({
    assert,
  }) => {
    const owner = await organizer()
    const { committee, payout } = await setup(owner)
    const service = new CommitteePayoutPaymentService()
    await assert.rejects(() => service.create(committee, payout, input(), 2147483647))
    assert.lengthOf(await CommitteePayoutPayment.query(), 0)
    await payout.refresh()
    assert.strictEqual(payout.paidAmount, '0.00')
    await db
      .from('committee_payouts')
      .where('id', payout.id)
      .update({ paid_amount: '1.00', status: 'partially_paid' })
    await assert.rejects(() => service.create(committee, payout, input(), owner.user.id))
    assert.lengthOf(await CommitteePayoutPayment.query(), 0)
  })
})
