#!/usr/bin/env python3
"""
Summarise a macOS `sample` call graph by where the renderer's CPU actually goes.

The addon-boundary counters in BenchStats say what crossing into JS costs, and
on the scenarios that rebuild geometry they account for under 4% of the frame.
The rest is inside libcuemol2, where there are no counters, so a sampling
profiler is what locates it. This reduces a call graph to the few areas the
optimization work can act on, and names the call sites feeding each one --
`sample` output is otherwise thousands of lines of mangled C++.

Everything is measured against one denominator: the self time inside the
CueMol worker thread. A renderer process parks about twenty idle threads in
mach_msg2_trap, so any whole-process total is mostly sleep; and the work does
not all live in libcuemol2 either -- a dynamic_cast is charged to libc++abi and
an allocation to libsystem_malloc, so filtering to one binary would hide the
very overhead worth removing while leaving the geometry work fully counted.

Usage: profile_report.py prof-ribbon-morph.txt [more.txt ...]
"""

import collections
import re
import sys

# Areas worth separating: each is a different kind of fix, not just a different
# function. Order matters only for reading.
AREAS = (
    ('mesh emission',
     r'TrigGpuPrim::|DisplayList::(vertex|normal|color|createTrigMesh)|GrowMesh'
     r'|MeshVert|renderTube|renderSpline|renderJct'),
    ('RTTI (dynamic_cast)', r'dynamic_cast|class_type_info|dyn_cast'),
    ('scriptable smart pointer', r'LSupScrSp|LScrSp<'),
    ('per-element lookup',
     r'getResidue|MolCoord::getAtom|SceneManager::getObject|getChain|getParent'),
    ('colour resolution',
     r'NamedColRes|ColorTable|AbstractColor|ColSchmHolder|calcColor|getAtomColor'
     r'|modifyColor'),
    ('selection test', r'isSelected|SelCommand|SelPropNode|SelRefNode|SelOpNode'),
    ('allocation', r'operator new|operator delete|\bmalloc\b|\bfree\b|nanov2'),
    ('matrix fetch', r'getModelViewMat|getProjMat'),
)

# Frames that are overhead rather than work, and the callers worth blaming.
BLAME = (
    ('RTTI', r'dynamic_cast|class_type_info|dyn_cast'),
    ('LSupScrSp', r'LSupScrSp'),
)


def parse(path):
    """Return (depth, samples, symbol) for every call-graph line."""
    lines = open(path, errors='replace').read().splitlines()
    try:
        start = lines.index('Call graph:')
    except ValueError:
        start = 0
    out = []
    for line in lines[start:]:
        m = re.match(r'^(.*?)(\d+) (.*)$', line)
        if not m:
            continue
        # `sample` draws the tree with these; the count's column is the depth.
        if not re.fullmatch(r'[ +!:|]*', m.group(1)):
            continue
        out.append((len(m.group(1)), int(m.group(2)), m.group(3).strip()))
    return out


def self_time(ents):
    """A frame's own samples: its total less its immediate children's."""
    acc = collections.Counter()
    for i, (depth, count, sym) in enumerate(ents):
        below = []
        for d2, c2, _ in ents[i + 1:]:
            if d2 <= depth:
                break
            below.append((d2, c2))
        child = 0
        if below:
            kid = min(d for d, _ in below)
            child = sum(c for d, c in below if d == kid)
        acc[sym] += max(0, count - child)
    return acc


def short(sym):
    return re.sub(r'\s*\(in [^)]+\).*$', '', sym)[:86]


def worker_subtree(ents):
    """The CueMol worker thread's frames -- everything else is idle or Chrome."""
    for i, (depth, _, sym) in enumerate(ents):
        if 'DedicatedWorker thread' not in sym:
            continue
        out = [ents[i]]
        for e in ents[i + 1:]:
            if e[0] <= depth:
                break
            out.append(e)
        return out
    return []


def blame(ents, pattern):
    """Nearest libcuemol2 ancestor of each frame matching `pattern`."""
    out = collections.Counter()
    for i, (depth, count, sym) in enumerate(ents):
        if not re.search(pattern, sym):
            continue
        for j in range(i - 1, -1, -1):
            d2, _, s2 = ents[j]
            if d2 < depth and 'libcuemol2' in s2 and not re.search(pattern, s2):
                out[short(s2)] += count
                break
    return out


def report(path):
    ents = parse(path)
    if not ents:
        print(f'{path}: no call graph found')
        return
    worker = worker_subtree(ents)
    print(f'\n=== {path} ===')
    if not worker:
        print('no CueMol worker thread in this sample')
        return
    acc = self_time(worker)
    # The thread's own frame carries no work; drop it so idle time in the
    # thread's root does not inflate the denominator.
    total = sum(c for s, c in acc.items() if 'DedicatedWorker thread' not in s)
    if total == 0:
        print('worker thread was idle for the whole sample')
        return
    cue = sum(c for s, c in acc.items() if 'libcuemol2' in s)
    print(f'worker-thread self samples: {total}  (libcuemol2 {cue}, '
          f'{cue / total * 100:.0f}%)')
    print(f"{'samples':>8s} {'share':>7s}  area")
    claimed = 0
    for name, pat in AREAS:
        c = sum(v for s, v in acc.items() if re.search(pat, s))
        claimed += c
        print(f'{c:8d} {c / total * 100:6.1f}%  {name}')
    print(f'{total - claimed:8d} {(total - claimed) / total * 100:6.1f}%  '
          f'(unclassified)')

    for label, pat in BLAME:
        top = blame(worker, pat).most_common(6)
        if not top:
            continue
        print(f'\n  {label} charged to:')
        for sym, c in top:
            print(f'  {c:6d}  {sym}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip().splitlines()[-1])
    for p in sys.argv[1:]:
        report(p)
