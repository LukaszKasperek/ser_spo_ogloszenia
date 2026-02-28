import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;

const idSchema = z
  .string()
  .trim()
  .regex(objectIdRegex, 'Nieprawidlowe ID ogloszenia');

export const workIdParamsSchema = z.object({
  id: idSchema,
});

export const workListQuerySchema = z.object({
  limit: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 25;
      }
      return Number(value);
    }, z.number().int().min(1).max(25))
    .default(25),
  cursor: idSchema.optional(),
});

export const favoritesBodySchema = z.object({
  ids: z
    .array(idSchema)
    .min(1, 'Lista ulubionych nie moze byc pusta')
    .max(100, 'Maksymalnie 100 elementow na zapytanie'),
});

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

export const workContactResponseSchema = z
  .object({
    email: optionalTrimmedString.pipe(z.email().optional()),
    address: optionalTrimmedString,
    phone: optionalTrimmedString.pipe(
      z
        .string()
        .min(3, 'Telefon jest za krotki')
        .max(32, 'Telefon jest za dlugi')
        .regex(/^[\d+\s().-]+$/, 'Nieprawidlowy numer telefonu')
        .optional(),
    ),
  })
  .strict();
