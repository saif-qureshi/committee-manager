import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('committee_contributions', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable()
      table.uuid('committee_id').notNullable()
      table.uuid('committee_member_id').notNullable()
      table.uuid('organization_member_id').notNullable()
      table.uuid('payout_id').notNullable()
      table.decimal('amount', 14, 2).notNullable()
      table.date('paid_on').notNullable()
      table
        .enum('payment_method', ['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'other'])
        .notNullable()
      table.string('reference', 120).nullable()
      table.integer('recorded_by').notNullable().references('id').inTable('users')
      table.uuid('request_id').notNullable()
      table.string('request_hash', 64).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table
        .foreign(['organization_id', 'committee_id', 'committee_member_id'])
        .references(['organization_id', 'committee_id', 'id'])
        .inTable('committee_members')
      table
        .foreign(['organization_id', 'committee_id', 'payout_id'])
        .references(['organization_id', 'committee_id', 'id'])
        .inTable('committee_payouts')
      table
        .foreign(['organization_id', 'organization_member_id'])
        .references(['organization_id', 'id'])
        .inTable('organization_members')
      table.unique(['organization_id', 'request_id'], 'contributions_request_unique')
      table.index(['committee_id', 'committee_member_id', 'payout_id'])
      table.check('amount BETWEEN 0.01 AND 9999999999.99')
    })
  }

  async down() {
    this.schema.dropTable('committee_contributions')
  }
}
