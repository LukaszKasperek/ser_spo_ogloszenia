import type { Request, Response } from 'express';
import { Types } from 'mongoose';

import { WorkModel } from '../models/workModel';
import {
  favoritesBodySchema,
  workContactResponseSchema,
  workIdParamsSchema,
  workListQuerySchema,
} from '../validation/workSchemas';

const publicProjection = { author: 0 } as const;

export async function getWorkList(req: Request, res: Response): Promise<void> {
  const validation = workListQuerySchema.safeParse(req.query);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const { limit, cursor } = validation.data;
  const filter = cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {};

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

  res.status(200).json({ items, nextCursor });
}

export async function getWorkById(req: Request, res: Response): Promise<void> {
  const validation = workIdParamsSchema.safeParse(req.params);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const work = await WorkModel.findById(validation.data.id, publicProjection)
    .lean()
    .exec();

  if (!work) {
    res.status(404).json({ error: 'Ogloszenie nie istnieje.' });
    return;
  }

  res.status(200).json(work);
}

export async function getWorkContact(
  req: Request,
  res: Response,
): Promise<void> {
  const validation = workIdParamsSchema.safeParse(req.params);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const workContact = await WorkModel.findById(validation.data.id)
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
  const validation = favoritesBodySchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ error: validation.error.issues[0]?.message });
    return;
  }

  const uniqueIds = [...new Set(validation.data.ids)];
  const objectIds = uniqueIds.map((id) => new Types.ObjectId(id));

  const found = await WorkModel.find(
    { _id: { $in: objectIds } },
    publicProjection,
  )
    .lean()
    .exec();

  const foundIds = new Set(found.map((item) => String(item._id)));
  const missing = uniqueIds
    .filter((id) => !foundIds.has(id))
    .map((id) => ({ id, message: 'Ogłoszenie nie aktualne.' }));

  res.status(200).json({ found, missing });
}
