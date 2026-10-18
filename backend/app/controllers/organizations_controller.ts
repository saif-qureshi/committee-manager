import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import OrganizationTransformer from '#transformers/organization_transformer'

export default class OrganizationsController {
  async show({ auth, bouncer, serialize }: HttpContext) {
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('view', organization)
    return serialize(OrganizationTransformer.transform(organization))
  }
}
