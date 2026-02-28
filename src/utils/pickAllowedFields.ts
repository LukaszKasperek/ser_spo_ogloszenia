type AllowedKeyTuple = readonly string[];

export function pickAllowedFields<T extends AllowedKeyTuple>(
  input: unknown,
  allowedKeys: T,
): Partial<Record<T[number], unknown>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const source = input as Record<string, unknown>;
  const result: Partial<Record<T[number], unknown>> = {};

  for (const key of allowedKeys) {
    if (Object.hasOwn(source, key)) {
      result[key as T[number]] = source[key];
    }
  }

  return result;
}
