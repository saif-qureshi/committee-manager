export function toMinorUnits(amount: string): bigint {
  const [rupees, fraction = ''] = amount.split('.')
  return BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function formatAmount(amount: bigint): string {
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`
}
