import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { ApiError, apiRequest } from '../src/lib/api.ts';
import { formatAmount } from '../src/features/committees/format-amount.ts';
import {
  parseCommitteeForm,
  payoutPerRound,
} from '../src/features/committees/committee-form.ts';

import { localDate } from '../src/lib/date.ts';

const draft = {
  name: 'Family committee',
  contributionAmount: '10000',
  slotCount: '10',
  selectionType: 'fixed',
  frequency: 'monthly',
  firstDueDate: '2026-10-19',
  overdueDrawAllowed: null,
};

test('committee forms normalize payloads without floating-point amounts and preview exact payouts', () => {
  const result = parseCommitteeForm({
    ...draft,
    name: '  Family committee  ',
    contributionAmount: ' 10000.5 ',
    overdueDrawAllowed: true,
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.input.name, 'Family committee');
  assert.equal(result.input.contributionAmount, '10000.50');
  assert.equal(result.input.slotCount, 10);
  assert.equal(result.input.overdueDrawAllowed, null);
  assert.equal(payoutPerRound('10000', '10'), '100000.00');
  assert.equal(payoutPerRound('0.01', '100'), '1.00');
  assert.equal(payoutPerRound('9999999999.99', '100'), '999999999999.00');
});

test('invalid committee amounts and slot counts never produce a payload or payout preview', () => {
  for (const contributionAmount of [
    '',
    '0',
    '0.00',
    '-1',
    '1e3',
    '01',
    '1.234',
    '10000000000',
    '10,000',
  ]) {
    const parsed = parseCommitteeForm({ ...draft, contributionAmount });
    assert.equal(parsed.input, null, contributionAmount);
    assert.ok(parsed.errors.contributionAmount);
    assert.equal(payoutPerRound(contributionAmount, '10'), null);
  }
  for (const slotCount of ['', '0', '101', '-1', '10.5', '10.0', '001']) {
    assert.equal(
      parseCommitteeForm({ ...draft, slotCount }).input,
      null,
      slotCount,
    );
    assert.equal(payoutPerRound('10000', slotCount), null);
  }
  assert.ok(parseCommitteeForm({ ...draft, name: ' ' }).errors.name);
  assert.ok(
    parseCommitteeForm({ ...draft, name: 'x'.repeat(121) }).errors.name,
  );
});

test('calendar dates stay date-only, handle leap years, and use the local day for dashboard reports', () => {
  for (const firstDueDate of [
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-01-01T00:00:00Z',
    '1899-12-31',
    '2101-01-01',
    'bad',
  ]) {
    assert.ok(
      parseCommitteeForm({ ...draft, firstDueDate }).errors.firstDueDate,
      firstDueDate,
    );
  }
  for (const firstDueDate of ['2028-02-29', '1900-01-01', '2100-12-31']) {
    assert.equal(
      parseCommitteeForm({ ...draft, firstDueDate }).input.firstDueDate,
      firstDueDate,
    );
  }
  assert.equal(localDate(new Date(2026, 9, 19, 23, 59)), '2026-10-19');
  assert.equal(localDate(new Date('2028-02-29T12:00:00')), '2028-02-29');
  assert.equal(localDate(new Date('2026-10-19T12:00:00')), '2026-10-19');
});

test('lucky draw setup requires an explicit overdue rule and preserves either choice', () => {
  assert.ok(
    parseCommitteeForm({ ...draft, selectionType: 'draw' }).errors
      .overdueDrawAllowed,
  );
  for (const overdueDrawAllowed of [true, false]) {
    const result = parseCommitteeForm({
      ...draft,
      selectionType: 'draw',
      frequency: 'weekly',
      overdueDrawAllowed,
    });
    assert.equal(result.input.overdueDrawAllowed, overdueDrawAllowed);
    assert.equal(result.input.frequency, 'weekly');
  }
});

test('currency display preserves decimal strings and large amounts without rounding', () => {
  for (const [amount, expected] of [
    ['0.01', '0.01'],
    ['10000.00', '10,000.00'],
    ['9999999999.99', '9,999,999,999.99'],
    ['99999999999900.00', '99,999,999,999,900.00'],
  ])
    assert.equal(formatAmount(amount), expected);
});

test('English and Urdu translations have matching keys and interpolation fields', async () => {
  const load = async (language) =>
    JSON.parse(
      await readFile(
        new URL(`../src/i18n/${language}.json`, import.meta.url),
        'utf8',
      ),
    );
  const english = await load('en');
  const urdu = await load('ur');
  function compare(left, right) {
    assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort());
    for (const key of Object.keys(left)) {
      if (typeof left[key] === 'object') compare(left[key], right[key]);
      else {
        assert.ok(right[key].trim());
        assert.deepEqual(
          left[key].match(/{{\w+}}/g),
          right[key].match(/{{\w+}}/g),
        );
      }
    }
  }
  compare(english, urdu);
});

test('API requests scope bearer tokens, compose URLs, and handle errors and empty responses', async (context) => {
  const original = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = 'https://committee.example/';
  context.after(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = original;
  });
  let response = new Response(JSON.stringify({ data: [] }), { status: 200 });
  const fetch = context.mock.method(globalThis, 'fetch', async () => response);
  await apiRequest('/organization/committees', {
    token: 'test-token',
    signal: new AbortController().signal,
  });
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, 'https://committee.example/api/v1/organization/committees');
  assert.equal(options.headers.get('Authorization'), 'Bearer test-token');
  assert.ok(options.signal instanceof AbortSignal);
  response = new Response(null, { status: 204 });
  assert.equal(
    await apiRequest('/sessions/current', {
      method: 'DELETE',
      token: 'test-token',
    }),
    undefined,
  );
  response = new Response('{}', { status: 401 });
  await assert.rejects(
    apiRequest('/users/me'),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(
    fetch.mock.calls.at(-1).arguments[1].headers.has('Authorization'),
    false,
  );
});

test('slot assignment replaces only the selected slot, preserves all others, and permits multiple slots per member', async () => {
  const { slotAssignments } =
    await import('../src/features/committees/slot-assignments.ts');
  const slots = [
    { slotNumber: 1, organizationMemberId: 'a' },
    { slotNumber: 2, organizationMemberId: null },
    { slotNumber: 3, organizationMemberId: 'b' },
  ];
  assert.deepEqual(slotAssignments(slots, 2, 'a'), [
    { slotNumber: 1, organizationMemberId: 'a' },
    { slotNumber: 2, organizationMemberId: 'a' },
    { slotNumber: 3, organizationMemberId: 'b' },
  ]);
  assert.deepEqual(slotAssignments(slots, 1, null), [
    { slotNumber: 1, organizationMemberId: null },
    { slotNumber: 2, organizationMemberId: null },
    { slotNumber: 3, organizationMemberId: 'b' },
  ]);
  assert.equal(slots[0].organizationMemberId, 'a');
});
