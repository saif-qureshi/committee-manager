import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { formatAmount, toMinorUnits } from '#helpers/money'
import AuthService from '#services/auth_service'
import CommitteeService from '#services/committee_service'
import CommitteeScheduleService from '#services/committee_schedule_service'
import CommitteeMemberService from '#services/committee_member_service'
import CommitteeContributionService from '#services/committee_contribution_service'
import CommitteeDueService from '#services/committee_due_service'
import CommitteeBalanceService from '#services/committee_balance_service'
import CommitteePayoutPaymentService from '#services/committee_payout_payment_service'
import CommitteeContribution from '#models/committee_contribution'
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
  changes: { active?: boolean; draw?: boolean; amount?: string; slots?: number } = {}
) {
  const committee = await new CommitteeService(new CommitteeScheduleService()).create(
    owner.organization,
    {
      name: 'Family',
      contributionAmount: changes.amount ?? '100.00',
      slotCount: changes.slots ?? 2,
      selectionType: changes.draw ? 'draw' : 'fixed',
      frequency: 'monthly',
      firstDueDate: '2026-01-31',
      overdueDrawAllowed: changes.draw ? false : null,
    }
  )
  const members = await CommitteeMember.query()
    .where('committee_id', committee.id)
    .orderBy('slot_number')
  await new CommitteeMemberService().update(
    committee,
    members.map((member) => ({
      slotNumber: member.slotNumber,
      organizationMemberId: owner.membership.id,
    }))
  )
  if (changes.active !== false) await new CommitteeScheduleService().activate(committee)
  const payouts = await CommitteePayout.query()
    .where('committee_id', committee.id)
    .orderBy('round_number')
  const input = () => ({
    committeeMemberId: members[0].id,
    payoutId: payouts[0].id,
    requestId: randomUUID(),
    paidOn: '2026-02-01',
    paymentMethod: 'cash' as const,
  })
  return {
    committee,
    members,
    payouts,
    input,
    path: `${base}/${committee.id}/contributions`,
    dues: `${base}/${committee.id}/dues`,
  }
}

test.group('Contribution collection and overdue balances', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('Mark as Paid records the full balance and derives pending, overdue, and paid per slot and round', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const dueToday = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-01-31' })
    dueToday.assertStatus(200)
    assert.lengthOf(dueToday.body().data, 4)
    assert.isTrue(dueToday.body().data.every((due: { status: string }) => due.status === 'pending'))
    const overdue = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01', status: 'overdue' })
    overdue.assertStatus(200)
    assert.lengthOf(overdue.body().data, 2)
    assert.equal(overdue.body().data[0].daysOverdue, 1)
    assert.equal(overdue.body().data[0].fullName, 'Organizer')
    assert.strictEqual(overdue.body().data[0].remainingAmount, '100.00')
    const received = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json({ ...fixture.input(), recordedBy: 9999, organizationMemberId: randomUUID() })
    received.assertStatus(201)
    assert.strictEqual(received.body().data.amount, '100.00')
    assert.equal(received.body().data.recordedBy, owner.user.id)
    assert.equal(received.body().data.organizationMemberId, owner.membership.id)
    assert.notProperty(received.body().data, 'requestHash')
    assert.equal(DateTime.fromISO(received.body().data.createdAt, { setZone: true }).offset, 0)
    const paid = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01', status: 'paid' })
    assert.lengthOf(paid.body().data, 1)
    assert.strictEqual(paid.body().data[0].remainingAmount, '0.00')
    assert.equal(paid.body().data[0].daysOverdue, 0)
    const otherSlot = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01', status: 'overdue' })
    assert.lengthOf(otherSlot.body().data, 1)
    assert.equal(otherSlot.body().data[0].slotNumber, 2)
    const historical = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-01-31', status: 'paid' })
    assert.lengthOf(historical.body().data, 0)
  })

  test('occasional partial payments leave the balance overdue and Mark as Paid collects only the remainder', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const partial = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json({ ...fixture.input(), amount: '30.25' })
    partial.assertStatus(201)
    const balance = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-02', committeeMemberId: fixture.members[0].id, status: 'overdue' })
    balance.assertStatus(200)
    assert.strictEqual(balance.body().data[0].remainingAmount, '69.75')
    assert.isTrue(balance.body().data[0].isPartiallyPaid)
    assert.equal(balance.body().data[0].daysOverdue, 2)
    const remaining = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json(fixture.input())
    remaining.assertStatus(201)
    assert.strictEqual(remaining.body().data.amount, '69.75')
    const paid = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-02', status: 'paid' })
    assert.lengthOf(paid.body().data, 1)
    assert.isFalse(paid.body().data[0].isPartiallyPaid)
    const extra = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json(fixture.input())
    extra.assertStatus(409)
  })

  test('request IDs preserve both full-payment and explicit-amount retry semantics', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const payload = fixture.input()
    const first = await client.request(fixture.path, 'POST').loginAs(owner.user).json(payload)
    first.assertStatus(201)
    const retry = await client.request(fixture.path, 'POST').loginAs(owner.user).json(payload)
    retry.assertStatus(200)
    assert.equal(retry.body().data.id, first.body().data.id)
    for (const change of [
      { amount: '100.00' },
      { paidOn: '2026-02-02' },
      { paymentMethod: 'other' },
      { reference: 'different' },
      { committeeMemberId: fixture.members[1].id },
    ]) {
      const conflict = await client
        .request(fixture.path, 'POST')
        .loginAs(owner.user)
        .json({ ...payload, ...change })
      conflict.assertStatus(409)
    }
    const explicit = { ...fixture.input(), committeeMemberId: fixture.members[1].id, amount: '10' }
    const one = await client.request(fixture.path, 'POST').loginAs(owner.user).json(explicit)
    one.assertStatus(201)
    const two = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json({ ...explicit, amount: '10.00', reference: '' })
    two.assertStatus(200)
    assert.equal(one.body().data.id, two.body().data.id)
    const stored = await CommitteeContribution.query().firstOrFail()
    assert.notProperty(stored.serialize(), 'requestHash')
    assert.lengthOf(await CommitteeContribution.query(), 2)
  })

  test('concurrent full-payment retries create one record and different requests cannot collect twice', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const payload = fixture.input()
    const repeated = await Promise.all([
      client.request(fixture.path, 'POST').loginAs(owner.user).json(payload),
      client.request(fixture.path, 'POST').loginAs(owner.user).json(payload),
    ])
    assert.deepEqual(repeated.map((result) => result.status()).sort(), [200, 201])
    const separate = await Promise.all([
      client
        .request(fixture.path, 'POST')
        .loginAs(owner.user)
        .json({ ...fixture.input(), committeeMemberId: fixture.members[1].id }),
      client
        .request(fixture.path, 'POST')
        .loginAs(owner.user)
        .json({ ...fixture.input(), committeeMemberId: fixture.members[1].id }),
    ])
    assert.deepEqual(separate.map((result) => result.status()).sort(), [201, 409])
    assert.lengthOf(await CommitteeContribution.query(), 2)
  })

  test('concurrent partial receipts cannot exceed the obligation', async ({ client, assert }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const results = await Promise.all([
      client
        .request(fixture.path, 'POST')
        .loginAs(owner.user)
        .json({ ...fixture.input(), amount: '70.00' }),
      client
        .request(fixture.path, 'POST')
        .loginAs(owner.user)
        .json({ ...fixture.input(), amount: '70.00' }),
    ])
    assert.deepEqual(results.map((result) => result.status()).sort(), [201, 409])
    assert.lengthOf(await CommitteeContribution.query(), 1)
  })

  test('contribution request IDs cannot collide across committees but are independent across organizations', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const first = await setup(owner)
    const second = await setup(owner)
    const requestId = randomUUID()
    const results = await Promise.all([
      client
        .request(first.path, 'POST')
        .loginAs(owner.user)
        .json({ ...first.input(), requestId }),
      client
        .request(second.path, 'POST')
        .loginAs(owner.user)
        .json({ ...second.input(), requestId }),
    ])
    assert.deepEqual(results.map((result) => result.status()).sort(), [201, 409])
    const other = await organizer('other')
    const third = await setup(other)
    const independent = await client
      .request(third.path, 'POST')
      .loginAs(other.user)
      .json({ ...third.input(), requestId })
    independent.assertStatus(201)
    assert.lengthOf(await CommitteeContribution.query(), 2)
  })

  test('drafts have no collectible dues, while active draw and already-paid payout rounds still require contributions', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const draft = await setup(owner, { active: false })
    const invalidReceipt = await client
      .request(draft.path, 'POST')
      .loginAs(owner.user)
      .json(draft.input())
    invalidReceipt.assertStatus(409)
    const noDues = await client
      .request(draft.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01' })
    noDues.assertStatus(409)
    const draw = await setup(owner, { draw: true })
    const received = await client.request(draw.path, 'POST').loginAs(owner.user).json(draw.input())
    received.assertStatus(201)
    const fixed = await setup(owner)
    await new CommitteePayoutPaymentService().create(
      fixed.committee,
      fixed.payouts[0],
      { requestId: randomUUID(), amount: '200.00', paidOn: '2026-02-01', paymentMethod: 'cash' },
      owner.user.id
    )
    const later = await client
      .request(fixed.path, 'POST')
      .loginAs(owner.user)
      .json({ ...fixed.input(), payoutId: fixed.payouts[1].id })
    later.assertStatus(201)
    const overdue = await client
      .request(fixed.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-03-01', status: 'overdue' })
    assert.lengthOf(overdue.body().data, 3)
  })

  test('malformed optional amounts never become full payments, and invalid inputs leave history empty', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    for (const change of [
      ...['0', '-1', '0.001', '1e2', '10000000000.00', '', '   '].map((amount) => ({ amount })),
      { amount: null },
      { amount: 1.25 },
      { paidOn: '2026-02-30' },
      { paidOn: '2026-02-01T00:00:00Z' },
      { paymentMethod: 'unknown' },
      { reference: 'x'.repeat(121) },
      { requestId: null },
      { payoutId: 'invalid' },
    ]) {
      const response = await client
        .request(fixture.path, 'POST')
        .loginAs(owner.user)
        .json({ ...fixture.input(), ...change })
      assert.equal(response.status(), 422, JSON.stringify(change))
    }
    const overpaid = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json({ ...fixture.input(), amount: '100.01' })
    overpaid.assertStatus(409)
    assert.lengthOf(await CommitteeContribution.query(), 0)
    for (const query of [
      {},
      { asOf: '2026-02-30' },
      { asOf: '2026-02-01', status: 'unknown' },
      { asOf: '2026-02-01', page: 0 },
    ]) {
      const invalid = await client.request(fixture.dues, 'GET').loginAs(owner.user).qs(query)
      invalid.assertStatus(422)
    }
  })

  test('contributions, dues, and history stay within the authorized organization and committee', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const other = await organizer('other')
    const foreign = await setup(other)
    for (const change of [
      { committeeMemberId: foreign.members[0].id },
      { payoutId: foreign.payouts[0].id },
    ]) {
      const invalid = await client
        .request(fixture.path, 'POST')
        .loginAs(owner.user)
        .json({ ...fixture.input(), ...change })
      invalid.assertStatus(404)
    }
    const deniedWrite = await client
      .request(fixture.path, 'POST')
      .loginAs(other.user)
      .json(fixture.input())
    deniedWrite.assertStatus(404)
    for (const path of [fixture.path, fixture.dues]) {
      const denied = await client
        .request(path, 'GET')
        .loginAs(other.user)
        .qs({ asOf: '2026-02-01' })
      denied.assertStatus(404)
    }
    const unauthenticated = await client.request(fixture.path, 'POST').json(fixture.input())
    unauthenticated.assertStatus(401)
    owner.membership.role = 'member'
    await owner.membership.save()
    const deniedMember = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json(fixture.input())
    deniedMember.assertStatus(404)
    const deniedRead = await client.request(fixture.path, 'GET').loginAs(owner.user)
    deniedRead.assertStatus(404)
    const deniedDues = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01' })
    deniedDues.assertStatus(404)
    assert.lengthOf(await CommitteeContribution.query(), 0)
  })

  test('history filters and pagination keep receipts separate for each slot and round', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const service = new CommitteeContributionService()
    for (let index = 0; index < 26; index++)
      await service.create(fixture.committee, { ...fixture.input(), amount: '0.10' }, owner.user.id)
    await service.create(
      fixture.committee,
      {
        ...fixture.input(),
        committeeMemberId: fixture.members[1].id,
        payoutId: fixture.payouts[1].id,
      },
      owner.user.id
    )
    const filtered = await client
      .request(fixture.path, 'GET')
      .loginAs(owner.user)
      .qs({ committeeMemberId: fixture.members[0].id, payoutId: fixture.payouts[0].id })
    filtered.assertStatus(200)
    assert.lengthOf(filtered.body().data, 25)
    const second = await client
      .request(fixture.path, 'GET')
      .loginAs(owner.user)
      .qs({ committeeMemberId: fixture.members[0].id, page: 2 })
    assert.lengthOf(second.body().data, 1)
    const due = await client
      .request(fixture.dues, 'GET')
      .loginAs(owner.user)
      .qs({ committeeMemberId: fixture.members[0].id, asOf: '2026-02-01', status: 'overdue' })
    assert.strictEqual(due.body().data[0].paidAmount, '2.60')
    assert.strictEqual(due.body().data[0].remainingAmount, '97.40')
    const balance = await new CommitteeBalanceService().show(fixture.committee, '2026-03-01')
    assert.strictEqual(balance.contributions.receivedAmount, '102.60')
  })

  test('maximum amounts remain exact and the largest committee dues paginate without stored installments', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner, { amount: '9999999999.99', slots: 100 })
    const partial = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json({ ...fixture.input(), amount: '0.01' })
    partial.assertStatus(201)
    const complete = await client
      .request(fixture.path, 'POST')
      .loginAs(owner.user)
      .json(fixture.input())
    complete.assertStatus(201)
    assert.strictEqual(complete.body().data.amount, '9999999999.98')
    const first = await new CommitteeDueService().list(fixture.committee, {
      asOf: '2026-02-01',
      status: 'paid',
    })
    assert.strictEqual(first.all()[0].paidAmount, '9999999999.99')
    const last = await new CommitteeDueService().list(fixture.committee, {
      asOf: '2026-02-01',
      page: 400,
    })
    assert.lengthOf(last.all(), 25)
    const balance = await new CommitteeBalanceService().show(fixture.committee, '2026-02-01')
    assert.strictEqual(balance.contributions.expectedAmount, '99999999999900.00')
    assert.strictEqual(balance.contributions.receivedAmount, '9999999999.99')
    assert.strictEqual(balance.contributions.overdueAmount, '989999999999.01')
    assert.isFalse(await db.connection().schema.hasTable('installments'))
  })

  test('financial summaries reconcile slot dues, receipts, and handovers using payment dates', async ({
    client,
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const contributions = new CommitteeContributionService()
    const handovers = new CommitteePayoutPaymentService()
    await contributions.create(
      fixture.committee,
      { ...fixture.input(), amount: '30.25' },
      owner.user.id
    )
    await contributions.create(
      fixture.committee,
      { ...fixture.input(), payoutId: fixture.payouts[1].id },
      owner.user.id
    )
    await handovers.create(
      fixture.committee,
      fixture.payouts[0],
      {
        requestId: randomUUID(),
        amount: '25.00',
        paidOn: '2026-02-01',
        paymentMethod: 'cash',
      },
      owner.user.id
    )
    await handovers.create(
      fixture.committee,
      fixture.payouts[0],
      {
        requestId: randomUUID(),
        amount: '50.00',
        paidOn: '2026-02-02',
        paymentMethod: 'cash',
      },
      owner.user.id
    )
    const other = await setup(owner)
    await contributions.create(other.committee, other.input(), owner.user.id)

    const path = `${base}/${fixture.committee.id}/balance`
    const response = await client
      .request(path, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01' })
    response.assertStatus(200)
    assert.deepEqual(response.body().data, {
      committeeId: fixture.committee.id,
      asOf: '2026-02-01',
      contributions: {
        expectedAmount: '400.00',
        receivedAmount: '130.25',
        remainingAmount: '269.75',
        overdueAmount: '169.75',
        pendingAmount: '100.00',
      },
      payouts: { expectedAmount: '400.00', paidAmount: '25.00', remainingAmount: '375.00' },
      recordedNetAmount: '105.25',
    })
    const today = await new CommitteeBalanceService().show(fixture.committee, '2026-01-31')
    assert.strictEqual(today.contributions.receivedAmount, '0.00')
    assert.strictEqual(today.contributions.overdueAmount, '0.00')
    assert.strictEqual(today.contributions.pendingAmount, '400.00')
    assert.strictEqual(today.payouts.paidAmount, '0.00')
    const later = await new CommitteeBalanceService().show(fixture.committee, '2026-03-01')
    assert.strictEqual(later.contributions.overdueAmount, '269.75')
    assert.strictEqual(later.contributions.pendingAmount, '0.00')
    assert.strictEqual(later.payouts.paidAmount, '75.00')
    assert.strictEqual(later.recordedNetAmount, '55.25')
    const dues = await new CommitteeDueService().list(fixture.committee, {
      asOf: '2026-02-01',
      status: 'overdue',
    })
    assert.strictEqual(
      formatAmount(dues.all().reduce((sum, due) => sum + toMinorUnits(due.remainingAmount), 0n)),
      response.body().data.contributions.overdueAmount
    )
  })

  test('financial summaries show a negative recorded net and a fully settled cycle without closing it', async ({
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const balances = new CommitteeBalanceService()
    const handovers = new CommitteePayoutPaymentService()
    await handovers.create(
      fixture.committee,
      fixture.payouts[0],
      {
        requestId: randomUUID(),
        amount: '0.01',
        paidOn: '2026-02-01',
        paymentMethod: 'cash',
      },
      owner.user.id
    )
    const first = await balances.show(fixture.committee, '2026-02-01')
    assert.strictEqual(first.recordedNetAmount, '-0.01')
    await handovers.create(
      fixture.committee,
      fixture.payouts[0],
      {
        requestId: randomUUID(),
        amount: '1.24',
        paidOn: '2026-02-01',
        paymentMethod: 'cash',
      },
      owner.user.id
    )
    const second = await balances.show(fixture.committee, '2026-02-01')
    assert.strictEqual(second.recordedNetAmount, '-1.25')
    for (const payout of fixture.payouts) {
      for (const member of fixture.members) {
        await new CommitteeContributionService().create(
          fixture.committee,
          {
            ...fixture.input(),
            payoutId: payout.id,
            committeeMemberId: member.id,
          },
          owner.user.id
        )
      }
      await handovers.create(
        fixture.committee,
        payout,
        {
          requestId: randomUUID(),
          amount: payout.id === fixture.payouts[0].id ? '198.75' : '200.00',
          paidOn: '2026-02-01',
          paymentMethod: 'cash',
        },
        owner.user.id
      )
    }
    const result = await balances.show(fixture.committee, '2026-03-01')
    assert.strictEqual(result.contributions.remainingAmount, '0.00')
    assert.strictEqual(result.contributions.overdueAmount, '0.00')
    assert.strictEqual(result.contributions.pendingAmount, '0.00')
    assert.strictEqual(result.payouts.paidAmount, '400.00')
    assert.strictEqual(result.payouts.remainingAmount, '0.00')
    assert.strictEqual(result.recordedNetAmount, '0.00')
    await fixture.committee.refresh()
    assert.strictEqual(fixture.committee.status, 'active')
  })

  test('financial summaries validate dates, require activation, and enforce organizer access', async ({
    client,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const path = `${base}/${fixture.committee.id}/balance`
    for (const query of [{}, { asOf: '2026-02-30' }, { asOf: '2026-02-01T00:00:00Z' }]) {
      const invalid = await client.request(path, 'GET').loginAs(owner.user).qs(query)
      invalid.assertStatus(422)
    }
    const unauthorized = await client.request(path, 'GET').qs({ asOf: '2026-02-01' })
    unauthorized.assertStatus(401)
    const draft = await setup(owner, { active: false })
    const draftResult = await client
      .request(`${base}/${draft.committee.id}/balance`, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01' })
    draftResult.assertStatus(409)
    const other = await organizer('other')
    const foreign = await client.request(path, 'GET').loginAs(other.user).qs({ asOf: '2026-02-01' })
    foreign.assertStatus(404)
    const missing = await client
      .request(`${base}/${randomUUID()}/balance`, 'GET')
      .loginAs(owner.user)
      .qs({ asOf: '2026-02-01' })
    missing.assertStatus(404)
    owner.membership.role = 'member'
    await owner.membership.save()
    const denied = await client.request(path, 'GET').loginAs(owner.user).qs({ asOf: '2026-02-01' })
    denied.assertStatus(404)
  })

  test('failed inserts never settle a due and composite keys reject foreign receipt targets', async ({
    assert,
  }) => {
    const owner = await organizer()
    const fixture = await setup(owner)
    const service = new CommitteeContributionService()
    await assert.rejects(() => service.create(fixture.committee, fixture.input(), 2147483647))
    assert.lengthOf(await CommitteeContribution.query(), 0)
    const other = await setup(owner)
    await assert.rejects(() =>
      CommitteeContribution.create({
        id: randomUUID(),
        organizationId: owner.organization.id,
        committeeId: fixture.committee.id,
        committeeMemberId: other.members[0].id,
        organizationMemberId: owner.membership.id,
        payoutId: fixture.payouts[0].id,
        amount: '1.00',
        paidOn: DateTime.utc(),
        paymentMethod: 'cash',
        reference: null,
        recordedBy: owner.user.id,
        requestId: randomUUID(),
        requestHash: 'a'.repeat(64),
      })
    )
  })
})
