import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const sealed = new Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
  },
  { _id: false },
);

/**
 * A learner's Notion workspace.
 *
 * The access token is never stored in the clear: it lives sealed with
 * AES-256-GCM under ENCRYPTION_KEY, so a database dump grants nobody access to
 * anybody's workspace. Database ids are stored so a sync is an append, not a
 * search-and-guess every time.
 */
const databases = new Schema(
  {
    vocabulary: { type: String, default: null },
    mistakes: { type: String, default: null },
    missions: { type: String, default: null },
  },
  { _id: false },
);

const notionConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    accessToken: { type: sealed, required: true },
    workspaceId: { type: String, default: null },
    workspaceName: { type: String, default: null },
    botId: { type: String, default: null },
    parentPageId: { type: String, default: null },
    parentPageTitle: { type: String, default: null },
    databases: { type: databases, default: () => ({}) },
    lastSyncedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

export type NotionConnectionDoc = HydratedDocument<InferSchemaType<typeof notionConnectionSchema>>;
export const NotionConnection = model('NotionConnection', notionConnectionSchema);
