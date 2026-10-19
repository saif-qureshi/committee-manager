import { OrganizationSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Committee from '#models/committee'

export default class Organization extends OrganizationSchema {
  @hasMany(() => Committee)
  declare committees: HasMany<typeof Committee>
}
