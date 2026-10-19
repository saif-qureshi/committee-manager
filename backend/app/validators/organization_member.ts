import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { normalizeLoginIdentifier } from '#validators/login_identifier'

export const createOrganizationMemberValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(120),
  phone: vine
    .string()
    .parse((value) => (typeof value === 'string' ? normalizeLoginIdentifier(value.trim()) : value))
    .regex(/^\+[1-9]\d{7,14}$/),
})

export type OrganizationMemberInput = Infer<typeof createOrganizationMemberValidator>
