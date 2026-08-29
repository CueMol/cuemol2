/**
 * @file components/inspector/schema/predicates.ts
 * @description The conditions a row can be gated on.
 *
 * Named combinators rather than free functions: a schema stays readable, and
 * the set of things a gate can say stays small enough to reason about. Every
 * gate in the hand-written sections maps onto one line here.
 *
 * They are functions rather than data because a schema is a TypeScript module
 * -- nothing serialises it, so a data DSL would only buy a second evaluator to
 * keep in step with this one.
 */

import type { Predicate } from './types'

/** The property equals this value. False when the renderer has no such property. */
export const eq = (key: string, value: string | number | boolean): Predicate =>
  (ctx) => ctx.value(key) === value

/** The property differs from this value (an absent property counts as differing). */
export const neq = (key: string, value: string | number | boolean): Predicate =>
  (ctx) => ctx.value(key) !== value

/** The property is one of these values. */
export const oneOf = (key: string, values: readonly (string | number)[]): Predicate =>
  (ctx) => {
    const v = ctx.value(key)
    return v !== undefined && values.includes(v as string | number)
  }

/** The property is none of these values. */
export const notOneOf = (key: string, values: readonly (string | number)[]): Predicate =>
  (ctx) => !oneOf(key, values)(ctx)

/** A boolean property is on. */
export const isOn = (key: string): Predicate => (ctx) => ctx.value(key) === true

/** A boolean property is off (an absent property counts as off). */
export const isOff = (key: string): Predicate => (ctx) => ctx.value(key) !== true

/** The renderer does not expose this property at all. */
export const absent = (key: string): Predicate => (ctx) => ctx.get(key) === undefined

export const not = (p: Predicate): Predicate => (ctx) => !p(ctx)
export const and = (...ps: Predicate[]): Predicate => (ctx) => ps.every((p) => p(ctx))
export const or = (...ps: Predicate[]): Predicate => (ctx) => ps.some((p) => p(ctx))
