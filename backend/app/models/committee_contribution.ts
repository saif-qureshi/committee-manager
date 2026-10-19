import { column } from '@adonisjs/lucid/orm'
import { CommitteeContributionSchema } from '#database/schema'

export default class CommitteeContribution extends CommitteeContributionSchema {
  @column({ serializeAs: null })
  declare requestHash: string
}
