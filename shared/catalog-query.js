const keys = ['board','period','language','topic','useCase','age','q','official'];
// A tag refines the current view; it must not reset the user's other filters.
export function catalogQuery(current = {}, overrides = {}) {
  const values = {...current,...overrides}, query = new URLSearchParams();
  for (const key of keys) if (values[key] != null && String(values[key]) !== '') query.set(key,String(values[key]));
  return query.toString();
}
