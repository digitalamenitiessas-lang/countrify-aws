'use server'

import { z } from 'zod'
import { requireIAdmin } from '@/lib/auth'
import { insertIAdminAuditLogInPostgres } from '@/lib/db/iadmin-core'
import {
  analyzeUnitsColumns,
  executeUnitsImport,
  type AnalyzeColumnsResult,
  type ImportResult,
  type ImportTargetField,
} from '@/lib/iadmin/units-import-core'

export type { AnalyzeColumnsResult, ImportResult, ImportTargetField }

const analyzeSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  headers: z.array(z.string()).min(1),
  sampleRows: z.array(z.record(z.unknown())).min(1).max(8),
})

export async function analyzeImportColumns(
  input: z.input<typeof analyzeSchema>,
): Promise<AnalyzeColumnsResult> {
  const parsed = analyzeSchema.parse(input)
  await requireIAdmin({
    capability: 'units.manage',
    administrationId: parsed.administrationId,
  })

  return analyzeUnitsColumns({ headers: parsed.headers, sampleRows: parsed.sampleRows })
}

const rowSchema = z.record(z.unknown())
const importSchema = z.object({
  administrationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  mapping: z.record(z.string()),
  rows: z.array(rowSchema).min(1).max(500),
  replaceActiveHolders: z.boolean().optional().default(true),
})

export async function importUnitsAndHolders(
  input: z.input<typeof importSchema>,
): Promise<ImportResult> {
  const parsed = importSchema.parse(input)
  const { profile } = await requireIAdmin({
    capability: 'units.manage',
    administrationId: parsed.administrationId,
  })

  const result = await executeUnitsImport({
    propertyId: parsed.propertyId,
    mapping: parsed.mapping,
    rows: parsed.rows,
    replaceActiveHolders: parsed.replaceActiveHolders,
  })

  await insertIAdminAuditLogInPostgres({
    administrationId: parsed.administrationId,
    actorProfileId: profile.id,
    entityType: 'iadmin_managed_properties',
    entityId: parsed.propertyId,
    action: 'bulk_import.units',
    metadata: {
      units_created: result.unitsCreated,
      units_updated: result.unitsUpdated,
      holders_created: result.holdersCreated,
      holders_skipped: result.holdersSkipped,
      skipped_rows: result.skippedRows.length,
    },
  })

  return result
}
