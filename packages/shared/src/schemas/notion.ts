import { z } from 'zod';

/**
 * Notion export.
 *
 * The extension never holds a Notion token and never calls Notion — the
 * backend owns the OAuth exchange, seals the token with AES-256-GCM and does
 * every write itself (§I). What crosses to the client is this status object.
 */
export const NOTION_TARGETS = ['vocabulary', 'mistakes', 'missions'] as const;
export type NotionTarget = (typeof NOTION_TARGETS)[number];

export const NOTION_TARGET_LABEL: Record<NotionTarget, string> = {
  vocabulary: 'Vocabulary',
  mistakes: 'Corrections',
  missions: 'Daily missions',
};

export const notionStatusSchema = z.object({
  /** Whether the server has Notion credentials at all. False on a fresh clone. */
  configured: z.boolean(),
  connected: z.boolean(),
  workspaceName: z.string().nullable(),
  parentPageTitle: z.string().nullable(),
  databases: z.object({
    vocabulary: z.string().nullable(),
    mistakes: z.string().nullable(),
    missions: z.string().nullable(),
  }),
  lastSyncedAt: z.string().nullable(),
  pendingCounts: z.object({
    vocabulary: z.number().int().min(0),
    mistakes: z.number().int().min(0),
    missions: z.number().int().min(0),
  }),
});
export type NotionStatus = z.infer<typeof notionStatusSchema>;

export const notionConnectResponseSchema = z.object({ authorizeUrl: z.string().url() });
export type NotionConnectResponse = z.infer<typeof notionConnectResponseSchema>;

export const notionSyncRequestSchema = z.object({
  targets: z.array(z.enum(NOTION_TARGETS)).min(1).max(3).optional(),
});
export type NotionSyncRequest = z.infer<typeof notionSyncRequestSchema>;

export const notionSyncResultSchema = z.object({
  synced: z.object({
    vocabulary: z.number().int().min(0),
    mistakes: z.number().int().min(0),
    missions: z.number().int().min(0),
  }),
  lastSyncedAt: z.string(),
});
export type NotionSyncResult = z.infer<typeof notionSyncResultSchema>;
