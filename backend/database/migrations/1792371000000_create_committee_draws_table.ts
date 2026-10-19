import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('committee_draws', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable()
      table.uuid('committee_id').notNullable()
      table.uuid('payout_id').notNullable().unique()
      table.uuid('committee_member_id').notNullable()
      table.jsonb('eligible_slots').notNullable()
      table.boolean('overdue_draw_allowed').notNullable()
      table.date('drawn_on').notNullable()
      table.enum('method', ['random', 'automatic']).notNullable()
      table.integer('recorded_by').notNullable().references('id').inTable('users')
      table.uuid('request_id').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table
        .foreign(['organization_id', 'committee_id', 'payout_id'])
        .references(['organization_id', 'committee_id', 'id'])
        .inTable('committee_payouts')
      table
        .foreign(['organization_id', 'committee_id', 'committee_member_id'])
        .references(['organization_id', 'committee_id', 'id'])
        .inTable('committee_members')
      table.unique(['committee_id', 'committee_member_id'])
      table.unique(['organization_id', 'request_id'], 'committee_draws_request_unique')
      table.check(
        "jsonb_typeof(eligible_slots) = 'array' AND jsonb_array_length(eligible_slots) BETWEEN 1 AND 100"
      )
      table.check(
        "eligible_slots @> jsonb_build_array(jsonb_build_object('committeeMemberId', committee_member_id::text))"
      )
      table.check(
        "(method = 'automatic' AND jsonb_array_length(eligible_slots) = 1) OR (method = 'random' AND jsonb_array_length(eligible_slots) > 1)"
      )
    })
  }

  async down() {
    this.schema.dropTable('committee_draws')
  }
}
