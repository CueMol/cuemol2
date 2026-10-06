/**
 * @file plugins/console/worker/dialects/pymol/commands/viewMatrix.ts
 * @description PyMOL's 18-number view matrix, to and from CueMol's camera.
 *
 * The two cameras are the same model written differently:
 *
 *   PyMOL   p_cam = R (p - origin) + pos          (Scene.cpp SceneGetView,
 *                                                  SceneView.cpp toWorld...)
 *   CueMol  p_cam = M_q (p - center) + (0, 0, -distance)   (GUIView.cpp)
 *
 * with R read column-major from values 0-8, `pos` = values 9-11 and
 * `origin` = values 12-14. No axis flip is needed: PyMOL's doc line about
 * "+X left, +Y down" does not describe its matrices.
 *
 * What does not carry over one-to-one:
 * - PyMOL's pos.x / pos.y (the origin off the screen axis) has no CueMol
 *   counterpart; it is folded into the centre, which gives the same image
 *   but rotates about that point instead of PyMOL's origin.
 * - PyMOL's front / rear clip are two free distances; CueMol's slab is
 *   symmetric about the centre, so it is widened to keep both inside.
 * - PyMOL's perspective uses a field of view; CueMol's uses `zoom`, the
 *   visible height at the centre: zoom = 2 d tan(fov / 2). (PyMOL's GL path
 *   is about 1% narrower than its own fov at 20 degrees; the exact formula,
 *   which its ray tracer uses, is kept.)
 *
 * Pure, so the round trip can be tested.
 */

/** A unit quaternion in CueMol's layout: `a` is the scalar. */
export interface CamQuat {
  a: number
  x: number
  y: number
  z: number
}

/** The CueMol view state `set_view` writes and `get_view` reads. */
export interface CamState {
  quat: CamQuat
  center: [number, number, number]
  distance: number
  slab: number
  zoom: number
  perspective: boolean
}

/** PyMOL's default `field_of_view`, in degrees (SettingInfo.h). */
export const PYMOL_DEFAULT_FOV = 20

const DEG = Math.PI / 180

/**
 * CueMol's rotation matrix for `q` (LQuat::toRotMatrix), as [row][col].
 * It is the transpose of the textbook matrix, which is what the view uses.
 */
export function quatToMatrix(q: CamQuat): number[][] {
  const { a, x, y, z } = q
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * a), 2 * (z * x - y * a)],
    [2 * (x * y - z * a), 1 - 2 * (z * z + x * x), 2 * (y * z + x * a)],
    [2 * (z * x + y * a), 2 * (y * z - x * a), 1 - 2 * (x * x + y * y)],
  ]
}

/** The quaternion whose `quatToMatrix` is `m` (Shepperd's method). */
export function matrixToQuat(m: number[][]): CamQuat {
  const tr = m[0][0] + m[1][1] + m[2][2]
  let q: CamQuat
  if (tr > 0) {
    const a = 0.5 * Math.sqrt(1 + tr)
    q = { a, x: (m[1][2] - m[2][1]) / (4 * a), y: (m[2][0] - m[0][2]) / (4 * a), z: (m[0][1] - m[1][0]) / (4 * a) }
  } else if (m[0][0] >= m[1][1] && m[0][0] >= m[2][2]) {
    const x = 0.5 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2])
    q = { a: (m[1][2] - m[2][1]) / (4 * x), x, y: (m[0][1] + m[1][0]) / (4 * x), z: (m[0][2] + m[2][0]) / (4 * x) }
  } else if (m[1][1] >= m[2][2]) {
    const y = 0.5 * Math.sqrt(1 - m[0][0] + m[1][1] - m[2][2])
    q = { a: (m[2][0] - m[0][2]) / (4 * y), x: (m[0][1] + m[1][0]) / (4 * y), y, z: (m[1][2] + m[2][1]) / (4 * y) }
  } else {
    const z = 0.5 * Math.sqrt(1 - m[0][0] - m[1][1] + m[2][2])
    q = { a: (m[0][1] - m[1][0]) / (4 * z), x: (m[0][2] + m[2][0]) / (4 * z), y: (m[1][2] + m[2][1]) / (4 * z), z }
  }
  const n = Math.hypot(q.a, q.x, q.y, q.z) || 1
  return { a: q.a / n, x: q.x / n, y: q.y / n, z: q.z / n }
}

/**
 * CueMol's camera for a PyMOL view.
 *
 * @param v - the 18 numbers, in `get_view` order.
 * @param fov - the field of view to assume when value 17 carries none
 *   (|v17| <= 1, the old flag-only form).
 */
export function pymolToCam(v: readonly number[], fov: number = PYMOL_DEFAULT_FOV): CamState {
  // R[r][c] = v[3c + r]: values 0-8 are column-major.
  const R = [
    [v[0], v[3], v[6]],
    [v[1], v[4], v[7]],
    [v[2], v[5], v[8]],
  ]
  const distance = -v[11]
  // The model point on the screen axis at the origin's depth: origin - R^T (pos.x, pos.y, 0).
  const center: [number, number, number] = [
    v[12] - (R[0][0] * v[9] + R[1][0] * v[10]),
    v[13] - (R[0][1] * v[9] + R[1][1] * v[10]),
    v[14] - (R[0][2] * v[9] + R[1][2] * v[10]),
  ]
  // Wide enough that neither of PyMOL's planes cuts into what CueMol shows.
  const slab = 2 * Math.max(distance - v[15], v[16] - distance)
  const flag = v[17]
  const usedFov = Math.abs(flag) > 1 ? Math.abs(flag) : fov
  const perspective = !(flag > 0.5)
  return {
    quat: matrixToQuat(R),
    center,
    distance,
    slab,
    zoom: 2 * distance * Math.tan((usedFov / 2) * DEG),
    perspective,
  }
}

/** The 18 numbers `get_view` prints for CueMol's camera. */
export function camToPymol(cam: CamState): number[] {
  const m = quatToMatrix(cam.quat)
  let d = cam.distance
  let fov = (2 * Math.atan(cam.zoom / (2 * d))) / DEG
  // PyMOL reads |v17| <= 1 as a bare flag, so a field of view that narrow
  // cannot be written. Move the camera to where 20 degrees frames the same
  // height instead -- exact for an orthographic view, close for perspective.
  if (!(fov > 1)) {
    fov = PYMOL_DEFAULT_FOV
    d = cam.zoom / (2 * Math.tan((fov / 2) * DEG))
  }
  return [
    m[0][0], m[1][0], m[2][0],
    m[0][1], m[1][1], m[2][1],
    m[0][2], m[1][2], m[2][2],
    0, 0, -d,
    cam.center[0], cam.center[1], cam.center[2],
    Math.max(0.1, d - cam.slab / 2), d + cam.slab / 2,
    cam.perspective ? -fov : fov,
  ]
}

/** `get_view`'s printout: pasteable back into `set_view`, as PyMOL formats it. */
export function formatViewMatrix(v: readonly number[]): string[] {
  const f = (n: number): string => n.toFixed(9).padStart(14)
  const rows: string[] = []
  for (let i = 0; i < 18; i += 3) {
    const tail = i === 15 ? ' )' : ',\\'
    rows.push(`  ${f(v[i])}, ${f(v[i + 1])}, ${f(v[i + 2])}${tail}`)
  }
  return ['### cut below here and paste into script ###', 'set_view (\\', ...rows, '### cut above here and paste into script ###']
}

/**
 * The 18 numbers of a `set_view` argument: `(a, b, ...)` or `[a, b, ...]`,
 * with any whitespace.
 *
 * @returns null unless there are exactly 18 finite numbers.
 */
export function parseViewMatrix(raw: string): number[] | null {
  const body = raw.trim().replace(/^[([]/, '').replace(/[)\]]$/, '')
  const parts = body.split(',').map((s) => s.trim()).filter((s) => s !== '')
  if (parts.length !== 18) return null
  const nums = parts.map(Number)
  return nums.every((n) => Number.isFinite(n)) ? nums : null
}
