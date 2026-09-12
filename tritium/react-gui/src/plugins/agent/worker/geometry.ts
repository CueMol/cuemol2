/**
 * @file plugins/agent/worker/geometry.ts
 * @description Distance, angle and torsion from atom positions.
 *
 * The measure tool never needed these in TypeScript: it hands atom ids to the
 * atomintr renderer and C++ computes the number it draws. The agent has to
 * report the number as data, so it is computed here.
 *
 * `Vector.angle` returns radians and the wrapper does not expose C++'s
 * `Vector4D::torsion`, so angles are converted and the dihedral is done by
 * hand: the two plane normals give the magnitude, and a third vector along
 * the central bond gives the sign.
 *
 * The sign convention is taken from `qlib/VectorHelper.cpp` rather than
 * chosen, because the same measurement is also drawn as a label that C++
 * computes -- a dihedral reported with the opposite handedness to the one on
 * screen is worse than none. Note the order of that last cross product: with
 * the operands the other way round every torsion comes back negated, which
 * looks entirely plausible.
 */

import type { Vector } from '@cuemol/core/src/wrappers/Vector'

const RAD_TO_DEG = 180 / Math.PI

/** Distance between two atom positions, in angstroms. */
export function distanceOf(a: Vector, b: Vector): number {
  return a.sub(b).length()
}

/** Angle a-b-c at the middle atom, in degrees. */
export function angleOf(a: Vector, b: Vector, c: Vector): number {
  return a.sub(b).angle(c.sub(b)) * RAD_TO_DEG
}

/**
 * Torsion (dihedral) a-b-c-d about the b-c bond, in degrees, within (-180, 180].
 *
 * @returns null when the four atoms are collinear, where the angle is
 *   undefined rather than zero (C++ `Vector4D::torsion` throws on the same
 *   case; a tool would rather report "undefined" than a made-up number).
 */
export function torsionOf(a: Vector, b: Vector, c: Vector, d: Vector): number | null {
  const b1 = b.sub(a)
  const b2 = c.sub(b)
  const b3 = d.sub(c)

  const n1 = b1.cross(b2)
  const n2 = b2.cross(b3)
  if (n1.isZero() || n2.isZero()) return null

  // Signed angle between the two plane normals, taken about b2 so the result
  // carries a sign rather than the unsigned acos. `b2 x n1`, matching the
  // C++ `Vjk x A`.
  const m = b2.normalize().cross(n1)
  const x = n1.dot(n2)
  const y = m.dot(n2)
  if (x === 0 && y === 0) return null
  return Math.atan2(y, x) * RAD_TO_DEG
}
