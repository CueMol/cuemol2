#!/usr/bin/env python3
"""
Write a displaced copy of an mmCIF, to be the second frame of a morph.

The coordinate-update path -- the one a trajectory drives, where the atoms move
but the topology does not -- has no benchmark of its own unless a second set of
coordinates exists for the same atoms. Trajectories would need one per
structure in the ladder and none are fetchable from RCSB; a displaced copy of a
structure already in the corpus costs nothing and gives every size the same
treatment.

The scenario has to be verifiable by eye. A cell whose coordinates silently
never moved would report a perfectly healthy frame rate, and the only thing
separating that from a working cell is what the window shows -- so the
displacement is chosen to be unmistakable while the camera is also turning.

`random` (the default) gives every atom its own displacement, which reads as
the whole structure boiling and cannot be confused with the rotation. It does
not damage what the mesh renderers draw: secondary structure comes from the
annotation records in the original file, and a morph frame replaces
coordinates only, so a ribbon keeps its helices and sheets and merely wobbles.

`bend` moves atoms along x by an amount varying smoothly with z, as a domain
motion would.

Both amplitudes are a fraction of the structure's own extent rather than a
distance in angstroms, because the camera is fitted to the structure: a fixed
displacement that is an obvious wobble on crambin's 27 A is a fraction of a
pixel on a ribosome ten times that size, and the cell would look like a still
image. A proportional one looks the same at every rung of the ladder.

Displacements are drawn from a fixed seed, so the corpus is reproducible.

Usage:
  perturb.py data/1crn.cif data/1crn-morph.cif
  perturb.py data/4v6x.cif data/4v6x-morph.cif --mode bend
"""

import argparse
import math
import random
import sys

# mmCIF atom_site columns holding the position.
COORD_TAGS = ('_atom_site.Cartn_x', '_atom_site.Cartn_y', '_atom_site.Cartn_z')


def parse_atom_site_header(lines, i):
    """Read the tag list of the atom_site loop starting at `lines[i]` ('loop_')."""
    tags = []
    j = i + 1
    while j < len(lines) and lines[j].lstrip().startswith('_'):
        tags.append(lines[j].strip())
        j += 1
    return tags, j


def bend_x(x, z, zmin, zspan, amplitude):
    """Bend along x by a full cosine period over the z extent of the structure."""
    t = (z - zmin) / zspan if zspan > 0.0 else 0.0
    return x + amplitude * (1.0 - math.cos(2.0 * math.pi * t)) * 0.5


def jitter(rng, amplitude):
    """A random displacement vector of up to `amplitude` angstroms."""
    while True:
        dx, dy, dz = (rng.uniform(-1.0, 1.0) for _ in range(3))
        r2 = dx * dx + dy * dy + dz * dz
        if 0.0 < r2 <= 1.0:  # rejection-sample the ball, so no corner bias
            return dx * amplitude, dy * amplitude, dz * amplitude


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--mode', choices=('random', 'bend'), default='random',
                    help='random per-atom jitter (default) or a smooth bend')
    ap.add_argument('--amplitude', type=float, default=0.05,
                    help='peak displacement as a fraction of the structure '
                         'extent (default 0.05)')
    ap.add_argument('--seed', type=int, default=20260921,
                    help='seed for the random mode, so the corpus is reproducible')
    args = ap.parse_args()

    with open(args.src, 'r', errors='replace') as fh:
        lines = fh.read().splitlines()

    # Locate the atom_site loop and the three coordinate columns within it.
    start = end = None
    cols = None
    for i, line in enumerate(lines):
        if line.strip() != 'loop_':
            continue
        tags, body = parse_atom_site_header(lines, i)
        if not any(t.startswith('_atom_site.') for t in tags):
            continue
        try:
            cols = [tags.index(t) for t in COORD_TAGS]
        except ValueError:
            sys.exit(f'{args.src}: atom_site loop has no Cartn_x/y/z columns')
        start = body
        end = start
        while end < len(lines):
            s = lines[end].strip()
            if s == '' or s == '#' or s.startswith('loop_') or s.startswith('_'):
                break
            end += 1
        break

    if start is None:
        sys.exit(f'{args.src}: no atom_site loop found')

    # Two passes: the bend is defined against the z extent, so that has to be
    # known before anything is written.
    rows = []
    lo = [float('inf')] * 3
    hi = [float('-inf')] * 3
    for k in range(start, end):
        f = lines[k].split()
        if len(f) <= max(cols):
            rows.append(None)  # multi-line or quoted value: leave untouched
            continue
        try:
            xyz = [float(f[c]) for c in cols]
        except ValueError:
            rows.append(None)
            continue
        rows.append(f)
        for a in range(3):
            lo[a] = min(lo[a], xyz[a])
            hi[a] = max(hi[a], xyz[a])

    if not any(r is not None for r in rows):
        sys.exit(f'{args.src}: atom_site loop parsed to no usable rows')

    spans = [hi[a] - lo[a] for a in range(3)]
    zmin, zspan = lo[2], spans[2]
    # The longest axis, so the amplitude tracks the size the camera is fitted
    # to rather than whichever axis happens to be thin.
    extent = max(spans)
    rng = random.Random(args.seed)
    amplitude = args.amplitude * extent

    moved = 0
    for idx, f in enumerate(rows):
        if f is None:
            continue
        if args.mode == 'random':
            dx, dy, dz = jitter(rng, amplitude)
            f[cols[0]] = f'{float(f[cols[0]]) + dx:.3f}'
            f[cols[1]] = f'{float(f[cols[1]]) + dy:.3f}'
            f[cols[2]] = f'{float(f[cols[2]]) + dz:.3f}'
        else:
            x = float(f[cols[0]])
            z = float(f[cols[2]])
            f[cols[0]] = f'{bend_x(x, z, zmin, zspan, amplitude):.3f}'
        lines[start + idx] = ' '.join(f)
        moved += 1

    with open(args.dst, 'w') as fh:
        fh.write('\n'.join(lines) + '\n')

    print(f'{args.dst}: {moved} atoms displaced, mode {args.mode}, '
          f'extent {extent:.1f} A, peak {amplitude:.1f} A ({args.amplitude:.0%})')


if __name__ == '__main__':
    main()
