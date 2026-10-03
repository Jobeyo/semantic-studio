// Interna anrop mellan Klarify och Studio identifieras med en gemensam hemlig nyckel (INTERNAL_API_KEY).
export function isInternalRequest(request: Request): boolean {
  const key = process.env.INTERNAL_API_KEY;
  return !!key && request.headers.get('x-internal-key') === key;
}

/** Tar bort lösenord ur en modells anslutning innan den skickas vidare. */
export function withoutSecrets<T extends { sourceConfig?: unknown }>(model: T): T {
  const cfg = model.sourceConfig;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return model;
  const { password, lineagePassword, ...rest } = cfg as Record<string, unknown>;
  return { ...model, sourceConfig: { ...rest, hasPassword: !!password } };
}
