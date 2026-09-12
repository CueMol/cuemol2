/**
 * @file worker/shared/pluginCalls.ts
 * @description The wire name of a plugin-contributed worker service.
 *
 * Built-in services are declared in `ServiceMap` and registered under their
 * bare name; a plugin cannot add a row to that closed map, so its services
 * are registered under `plugin.<pluginId>.<name>` instead. The namespace is
 * what keeps the two lanes from colliding and lets `calls/index.test.ts` keep
 * asserting an exact one-for-one match between `ServiceMap` and the built-in
 * registrations.
 *
 * Loaded by both threads: the worker registers with this name, the renderer
 * calls with it.
 */

/** Prefix every plugin service name carries. */
export const PLUGIN_SERVICE_PREFIX = 'plugin.'

/** The registered / wire name of `name` as contributed by `pluginId`. */
export function pluginServiceName(pluginId: string, name: string): string {
  return `${PLUGIN_SERVICE_PREFIX}${pluginId}.${name}`
}

/** True when `name` addresses a plugin service rather than a built-in one. */
export function isPluginServiceName(name: string): boolean {
  return name.startsWith(PLUGIN_SERVICE_PREFIX)
}
