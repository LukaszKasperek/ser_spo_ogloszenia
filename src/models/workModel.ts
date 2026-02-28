import { Schema, model, type InferSchemaType } from 'mongoose';

const contactSchema = new Schema(
  {
    email: { type: String, trim: true, default: undefined },
    address: { type: String, trim: true, default: undefined },
    phone: { type: String, trim: true, default: undefined },
  },
  { _id: false },
);

const workSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    contact: { type: contactSchema, default: () => ({}) },
    description: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    author: { type: String, required: true, select: false, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'praca',
    versionKey: false,
  },
);

workSchema.index({ slug: 1 }, { unique: true });
workSchema.index({ createdAt: -1, _id: -1 });

export type WorkDocument = InferSchemaType<typeof workSchema>;
export const WorkModel = model<WorkDocument>('Work', workSchema);
