// Bridge helper for sync-typed wrapper methods used in async (ObjProxy) mode.
// Wrapper methods declare return type T, but at runtime the async path returns
// Promise<T>. Use asAsync() to safely cast and await.
//
// Example:
//   const json = await asAsync(strMgr.getInfoJSON2());
//   await asAsync(reader.setPath(path));
export function asAsync<T>(value: T): Promise<Awaited<T>> {
  return value as unknown as Promise<Awaited<T>>;
}
