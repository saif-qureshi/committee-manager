import vine from '@vinejs/vine'

export function normalizeLoginIdentifier(value: string) {
  return /^03\d{9}$/.test(value) ? `+92${value.slice(1)}` : value
}

export const loginIdentifier = () =>
  vine.string().trim().minLength(3).maxLength(254).transform(normalizeLoginIdentifier)
