import type { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';

import { WorkModel } from '../models/workModel';
import { pickAllowedFields } from '../utils/pickAllowedFields';
import {
  favoritesBodySchema,
  workContactResponseSchema,
  workListQuerySchema,
  workSlugParamsSchema,
} from '../validation/workSchemas';

const publicProjection = { author: 0, contact: 0 } as const;
const WORK_LIST_QUERY_WHITELIST = ['limit', 'cursor'] as const;
const FAVORITES_BODY_WHITELIST = ['ids'] as const;

function inferCreatedAtFromId(id: unknown): string | null {
  if (id instanceof Types.ObjectId) {
    return id.getTimestamp().toISOString();
  }

  if (typeof id === 'string' && Types.ObjectId.isValid(id)) {
    return new Types.ObjectId(id).getTimestamp().toISOString();
  }

  return null;
}

/** Upewnia się, że createdAt jest w odpowiedzi (ISO string) dla frontu. */
function toPublicWork<
  T extends { _id?: unknown; createdAt?: Date | string | null },
>(doc: T): T & { createdAt: string } {
  const created = doc.createdAt;
  const createdAt =
    created instanceof Date
      ? created.toISOString()
      : typeof created === 'string' && created.trim() !== ''
        ? created
        : inferCreatedAtFromId(doc._id) ?? new Date().toISOString();
  return { ...doc, createdAt } as T & { createdAt: string };
}

export async function getWorkList(req: Request, res: Response): Promise<void> {
  const validation = workListQuerySchema.safeParse(
    pickAllowedFields(req.query, WORK_LIST_QUERY_WHITELIST),
  );
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const { limit, cursor } = validation.data;
  const filter = cursor
    ? { _id: mongoose.trusted({ $lt: new Types.ObjectId(cursor) }) }
    : {};

  const workList = await WorkModel.find(filter, publicProjection)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()
    .exec();

  const hasNextPage = workList.length > limit;
  const items = hasNextPage ? workList.slice(0, limit) : workList;
  const nextCursor =
    hasNextPage && items.length > 0
      ? String(items[items.length - 1]._id)
      : null;

  res.status(200).json({ items: items.map(toPublicWork), nextCursor });
}

export async function getWorkBySlug(
  req: Request,
  res: Response,
): Promise<void> {
  const validation = workSlugParamsSchema.safeParse(req.params);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const work = await WorkModel.findOne(
    { slug: validation.data.slug },
    publicProjection,
  )
    .lean()
    .exec();

  if (!work) {
    res.status(404).json({ error: 'Ogloszenie nie istnieje.' });
    return;
  }

  res.status(200).json(toPublicWork(work));
}

export async function getWorkContact(
  req: Request,
  res: Response,
): Promise<void> {
  const validation = workSlugParamsSchema.safeParse(req.params);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const workContact = await WorkModel.findOne({ slug: validation.data.slug })
    .select({ contact: 1 })
    .select('+contact')
    .lean()
    .exec();

  if (!workContact) {
    res.status(404).json({ error: 'Ogloszenie nie istnieje.' });
    return;
  }

  const validatedContact = workContactResponseSchema.safeParse(
    workContact.contact ?? {},
  );
  if (!validatedContact.success) {
    res
      .status(500)
      .json({ error: 'Nieprawidlowe dane kontaktowe ogloszenia.' });
    return;
  }

  res.status(200).json({ contact: validatedContact.data });
}

export async function postWorkFavorites(
  req: Request,
  res: Response,
): Promise<void> {
  const validation = favoritesBodySchema.safeParse(
    pickAllowedFields(req.body, FAVORITES_BODY_WHITELIST),
  );
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const uniqueIds = [...new Set(validation.data.ids)];

  if (uniqueIds.length === 0) {
    res.status(200).json({ found: [], missing: [] });
    return;
  }

  const objectIds = uniqueIds.map((id) => new Types.ObjectId(id));

  const found = await WorkModel.find(
    { _id: mongoose.trusted({ $in: objectIds }) },
    publicProjection,
  )
    .lean()
    .exec();

  const foundIds = new Set(found.map((item) => String(item._id)));
  const missing = uniqueIds
    .filter((id) => !foundIds.has(id))
    .map((id) => ({ id, message: 'Ogłoszenie nie aktualne.' }));

  res.status(200).json({ found: found.map(toPublicWork), missing });
}
