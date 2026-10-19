export function formatAmount(amount: string): string {
  const [whole, fraction = '00'] = amount.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
