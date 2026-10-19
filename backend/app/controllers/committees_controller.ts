import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeService from '#services/committee_service'
import CommitteeTransformer from '#transformers/committee_transformer'
import {
  createCommitteeValidator,
  updateCommitteeValidator,
  showCommitteeValidator,
} from '#validators/committee'
import { paginationValidator } from '#validators/pagination'

@inject()
export default class CommitteesController {
  constructor(private committees: CommitteeService) {}

  async index({ auth, bouncer, request, serialize }: HttpContext) {
    const { page } = await request.validateUsing(paginationValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewCommittees', organization)
    const committees = await this.committees.list(organization, page)
    return serialize(CommitteeTransformer.paginate(committees.all(), committees.getMeta()))
  }

  async store({ auth, bouncer, request, response, serialize }: HttpContext) {
    const input = await request.validateUsing(createCommitteeValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('createCommittee', organization)
    const committee = await this.committees.create(organization, input)
    response.status(201)
    return serialize(CommitteeTransformer.transform(committee))
  }

  async show({ auth, bouncer, request, serialize }: HttpContext) {
    const { params } = await request.validateUsing(showCommitteeValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewCommittees', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .withCount('members', (query) =>
        query.whereNotNull('organization_member_id').as('assigned_member_count')
      )
      .firstOrFail()
    return serialize(CommitteeTransformer.transform(committee))
  }

  async update({ auth, bouncer, request, serialize }: HttpContext) {
    const { params, ...input } = await request.validateUsing(updateCommitteeValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('updateCommittee', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    const updated = await this.committees.update(committee, input)
    return serialize(CommitteeTransformer.transform(updated))
  }
}
