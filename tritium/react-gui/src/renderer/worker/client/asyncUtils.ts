/**
 * @file renderer/worker/client/asyncUtils.ts
 * @description Bridge helper for sync-typed wrapper methods used in async
 * (ObjProxy) mode. Wrapper methods declare return type `T`, but at runtime
 * the renderer (async) path returns `Promise<T>`. `asAsync()` casts the
 * value so the caller can `await` it without fighting the type system.
 */

/**
 * Cast a sync-typed wrapper return value to its async (Promise) form.
 *
 * @param value - The value to cast (declared `T`, actually `Promise<T>` at
 *   runtime under ObjProxy mode).
 * @returns The same value typed as `Promise<Awaited<T>>`.
 *
 * @example
 * ```ts
 * const json = await asAsync(strMgr.getInfoJSON2());
 * await asAsync(reader.setPath(path));
 * ```
 */
export function asAsync<T>(value: T): Promise<Awaited<T>> {
  return value as unknown as Promise<Awaited<T>>;
}
