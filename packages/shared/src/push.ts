import { z } from 'zod';

/**
 * Push notifications of the official app (`/api/v1/push`): the events a
 * phone can receive, who receives each one (a capability on the site) and,
 * for events of plugins, the plugin that sends them (`ctx.push.notify`).
 */
export const PUSH_EVENTS = [
  { id: 'comment.pending', capability: 'moderate_comments', plugin: null },
  { id: 'form.message', capability: 'manage_forms', plugin: 'forms' },
  { id: 'shop.order', capability: 'manage_shop', plugin: 'shop' },
] as const;
export type PushEvent = (typeof PUSH_EVENTS)[number]['id'];
export const PUSH_EVENT_IDS = PUSH_EVENTS.map((e) => e.id) as [PushEvent, ...PushEvent[]];
/** Phones of one person on one site. */
export const MAX_PUSH_DEVICES = 20;

export const pushPlatformSchema = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

/** `POST /push/devices`: registers the phone, or refreshes it (same token). */
export const registerPushDeviceSchema = z.object({
  /** The Firebase Cloud Messaging registration token. */
  token: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .regex(/^[\x21-\x7e]+$/, 'Not a valid token'),
  platform: pushPlatformSchema,
  /** E.g. the phone's model, shown in the profile. */
  name: z.string().trim().max(100).optional(),
});
export type RegisterPushDevice = z.infer<typeof registerPushDeviceSchema>;

/** `PUT /push/devices/:id`: the events this phone receives. */
export const updatePushDeviceSchema = z.object({
  events: z.array(z.enum(PUSH_EVENT_IDS)).max(PUSH_EVENTS.length),
});
export type UpdatePushDevice = z.infer<typeof updatePushDeviceSchema>;

export interface PushDeviceView {
  id: string;
  platform: PushPlatform;
  name: string;
  events: PushEvent[];
  createdAt: string;
  lastSeenAt: string;
}

/** `GET /push/status`: whether the site sends notifications, and which ones the person can get. */
export interface PushStatusView {
  enabled: boolean;
  events: PushEvent[];
}
