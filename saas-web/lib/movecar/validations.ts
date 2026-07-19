import { z } from 'zod'

export const TEMPLATE_IDS = ['classic', 'minimal', 'cartoon'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

const PLATE_NUMBER_MAX = 20
const VEHICLE_MODEL_MAX = 100

export const createTagSchema = z.object({
  plateNumber: z
    .string()
    .trim()
    .max(PLATE_NUMBER_MAX)
    .optional()
    .transform((v) => (v?.length ? v : undefined)),
  vehicleModel: z
    .string()
    .trim()
    .max(VEHICLE_MODEL_MAX)
    .optional()
    .transform((v) => (v?.length ? v : undefined)),
  templateId: z.enum(TEMPLATE_IDS).default('classic'),
  settings: z
    .object({
      delaySeconds: z.number().int().min(0).max(300).optional(),
      customMessage: z.string().max(200).optional(),
    })
    .default({}),
})

export type CreateTagInput = z.infer<typeof createTagSchema>

export const updateTagSchema = createTagSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type UpdateTagInput = z.infer<typeof updateTagSchema>

export const PUSH_CHANNELS = [
  'bark',
  'fcm',
  'telegram',
  'email',
] as const
export type PushChannel = (typeof PUSH_CHANNELS)[number]

export const addPushTokenSchema = z.object({
  channel: z.enum(PUSH_CHANNELS),
  tokenValue: z.string().trim().min(1).max(1000),
})

export type AddPushTokenInput = z.infer<typeof addPushTokenSchema>
