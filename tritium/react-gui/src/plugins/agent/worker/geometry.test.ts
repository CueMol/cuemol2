/**
 * @file plugins/agent/worker/geometry.test.ts
 * @description That the measured numbers are right.
 *
 * These are the only geometry calculations in TypeScript -- the measure tool
 * lets C++ compute what it draws -- so nothing else would catch a wrong
 * conversion or a flipped torsion sign.
 *
 * The torsion sign is the part worth pinning, and the expected values below
 * are C++'s (`qlib/VectorHelper.cpp` `Vector4D::torsion`), not a convention
 * picked here: the number this returns is reported next to a label C++ drew,
 * and a dihedral negated relative to the picture is wrong for every use it
 * has while looking entirely plausible. The first draft had it backwards.
 */

import { describe, it, expect } from 'vitest'
import { angleOf, distanceOf, torsionOf } from './geometry'

/** The bit of the Vector wrapper the geometry helpers use. */
function v(x: number, y: number, z: number): never {
  const self = {
    x, y, z,
    sub: (o: { x: number; y: number; z: number }) => v(x - o.x, y - o.y, z - o.z),
    cross: (o: { x: number; y: number; z: number }) =>
      v(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x),
    dot: (o: { x: number; y: number; z: number }) => x * o.x + y * o.y + z * o.z,
    length: () => Math.sqrt(x * x + y * y + z * z),
    isZero: () => x === 0 && y === 0 && z === 0,
    normalize: () => {
      const l = Math.sqrt(x * x + y * y + z * z)
      return v(x / l, y / l, z / l)
    },
    angle: (o: { x: number; y: number; z: number }) => {
      const dot = x * o.x + y * o.y + z * o.z
      const l = Math.sqrt(x * x + y * y + z * z) * Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z)
      return Math.acos(dot / l)
    },
  }
  return self as never
}

describe('measured geometry', () => {
  it('gives a distance in angstroms', () => {
    expect(distanceOf(v(0, 0, 0), v(3, 4, 0))).toBeCloseTo(5, 6)
  })

  it('gives an angle at the middle atom, in degrees', () => {
    // A right angle, so a radians-vs-degrees slip cannot pass.
    expect(angleOf(v(1, 0, 0), v(0, 0, 0), v(0, 1, 0))).toBeCloseTo(90, 6)
    expect(angleOf(v(1, 0, 0), v(0, 0, 0), v(-1, 0, 0))).toBeCloseTo(180, 6)
  })

  it('gives a signed torsion, and nothing when the atoms are collinear', () => {
    // Textbook cis / trans about the b-c bond along x.
    expect(torsionOf(v(0, 1, 0), v(0, 0, 0), v(1, 0, 0), v(1, 1, 0))).toBeCloseTo(0, 6)
    expect(torsionOf(v(0, 1, 0), v(0, 0, 0), v(1, 0, 0), v(1, -1, 0))).toBeCloseTo(180, 6)

    // The two rotations differ only in sign: getting that wrong gives a
    // plausible number with the wrong handedness.
    // Hand-worked through the C++ routine: A = Vij x Vjk = (0,0,1),
    // B = Vjk x Vkl = (0,-1,0), C = Vjk x A = (0,-1,0), so cos = 0 and
    // sin = +1, i.e. +90.
    const plus = torsionOf(v(0, 1, 0), v(0, 0, 0), v(1, 0, 0), v(1, 0, 1))
    const minus = torsionOf(v(0, 1, 0), v(0, 0, 0), v(1, 0, 0), v(1, 0, -1))
    expect(plus).toBeCloseTo(90, 6)
    expect(minus).toBeCloseTo(-90, 6)

    expect(torsionOf(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0))).toBeNull()
  })
})
