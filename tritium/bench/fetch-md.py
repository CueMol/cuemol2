#!/usr/bin/env python3
"""
Download and check the MD trajectory corpus described in md-corpus.json.

The md-playback scenario needs real trajectories, which RCSB does not serve, so
they come from public MD repositories instead. Fetching is kept out of the
benchmark run for the same reason fetch.sh is: a download inside a measurement
puts network variance into the numbers.

Every file lands in data/md/<id>/<name>. A file with a sha256 in the corpus is
checked against it, and a mismatch is an error rather than a warning -- a cell
measured on different bytes is not comparable with one measured on these. A
file whose sha256 is null (the MDposit export, which the server builds on
request, and the hand-placed `manual` entries) has its hash recorded in
data/md/manifest.json, so two machines can still tell whether they measured
the same thing.

An entry may also list `derived` files, made locally from a fetched one:

- `dcd-to-little-endian`: the I-FABP trajectory was written on a big-endian
  machine, and CueMol's DCD reader reads little-endian only. The conversion
  swaps bytes and nothing else, so the frames are the published ones.
- `pdb-to-gro`: a PDB topology whose atoms the PDB reader cannot tell apart.
  YiiP's two protein chains share chain ID P and its 24,000 waters wrap the
  four-digit residue number, so the reader drops the atoms it sees twice and
  the topology no longer matches the frames. The GRO reader numbers residues
  by when they restart rather than by their value (GROFileReader.cpp), so the
  same atoms in the same order come through whole.

A file may also be one member of a large uncompressed tar (`tarMember`),
fetched with HTTP Range requests so the rest of the archive is never
downloaded, and an XTC member may be cut to its first `xtcFrames` frames.
The ~4M-atom A4 portal-tail system is published only as a 41 GB tar; this
takes its topology and a few hundred MB of frames out of it.

`manual` entries are never downloaded. When their files are missing the
script prints where to put them and carries on; run.js then skips the cells
that need them.

Usage:
  ./fetch-md.py                # every entry
  ./fetch-md.py ifabp yiip     # the named entries only
"""

import hashlib
import json
import os
import struct
import sys
import time
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, 'md-corpus.json')
DATA_DIR = os.path.join(HERE, 'data', 'md')
CHUNK = 1 << 20


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            b = f.read(CHUNK)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def download(url, out, start=None, length=None, retries=20):
    """Stream `url` to `out` through a .part file, so an interrupted fetch never
    leaves a truncated file under the final name. With `start`/`length`, only
    that byte range of the resource is fetched (HTTP Range).

    A ranged fetch that the server cuts short -- Zenodo drops a long transfer
    now and then -- is resumed from where the .part file ends, including one
    left behind by an earlier run, up to `retries` times.
    """
    part = out + '.part'
    t0 = time.time()
    if start is None:
        _fetch_to(url, part, None, 'wb')
    elif length > PARALLEL_CHUNK:
        _download_parallel(url, part, start, length, retries)
    else:
        attempt = 0
        while True:
            have = os.path.getsize(part) if os.path.exists(part) else 0
            if have >= length:
                break
            if have > 0:
                print(f'    resuming at {have / 1e6:.1f} MB')
            try:
                _fetch_to(url, part, (start + have, length - have), 'ab')
            except OSError as e:  # URLError, connection reset, timeout
                print(f'    interrupted: {e}')
            attempt += 1
            if os.path.getsize(part) < length and attempt > retries:
                raise RuntimeError(f'{url}: gave up after {retries} retries')
            if os.path.getsize(part) < length:
                time.sleep(min(30, 2 * attempt))
        if os.path.getsize(part) != length:
            raise RuntimeError(f'{url}: got {os.path.getsize(part)} bytes of the {length} asked for')
    os.replace(part, out)
    print(f'    {os.path.getsize(out) / 1e6:.1f} MB in {time.time() - t0:.0f} s')


# A long ranged transfer is split into chunks fetched this many at a time.
# Zenodo serves one connection at a few tens of KB/s at worst, so a single
# 1.5 GB request can take a day where parallel ones need not. The chunks are
# small enough that the last few do not leave one slow connection running
# alone at the end (64 MB chunks left a 40 MB single-stream tail).
PARALLEL_CHUNK = 16 << 20
PARALLEL_JOBS = 6


def _download_parallel(url, part, start, length, retries):
    """Fetch [start, start+length) as PARALLEL_CHUNK pieces in parallel, each
    resumable in its own .NNN file, then join them into `part`."""
    import concurrent.futures

    nchunk = (length + PARALLEL_CHUNK - 1) // PARALLEL_CHUNK
    chunks = []
    for i in range(nchunk):
        off = i * PARALLEL_CHUNK
        chunks.append((f'{part}.{i:03d}', start + off, min(PARALLEL_CHUNK, length - off)))
    # A .part left by an earlier single-stream run is the head of chunk 0.
    if os.path.exists(part) and not os.path.exists(chunks[0][0]):
        if os.path.getsize(part) <= chunks[0][2]:
            os.replace(part, chunks[0][0])
        else:
            os.remove(part)

    progress = {'done': sum(os.path.getsize(c[0]) for c in chunks if os.path.exists(c[0]))}
    lock = __import__('threading').Lock()
    t0 = time.time()

    def one(chunk):
        path, cstart, clen = chunk
        attempt = 0
        while True:
            have = os.path.getsize(path) if os.path.exists(path) else 0
            if have >= clen:
                return
            try:
                before = have
                _fetch_to(url, path, (cstart + have, clen - have), 'ab', quiet=True)
            except OSError as e:
                print(f'    {os.path.basename(path)} interrupted: {e}', flush=True)
            got = os.path.getsize(path) - before
            with lock:
                progress['done'] += got
                rate = progress['done'] / max(1.0, time.time() - t0)
                print(f'    {progress["done"] / 1e6:8.1f} / {length / 1e6:.1f} MB'
                      f'  ({rate / 1e6:.2f} MB/s overall)', flush=True)
            if os.path.getsize(path) < clen:
                attempt += 1
                if attempt > retries:
                    raise RuntimeError(f'{path}: gave up after {retries} retries')
                time.sleep(min(30, 2 * attempt))

    with concurrent.futures.ThreadPoolExecutor(PARALLEL_JOBS) as ex:
        for f in [ex.submit(one, c) for c in chunks]:
            f.result()

    with open(part, 'wb') as g:
        for path, _, clen in chunks:
            if os.path.getsize(path) != clen:
                raise RuntimeError(f'{path}: {os.path.getsize(path)} bytes, expected {clen}')
            with open(path, 'rb') as f:
                while True:
                    b = f.read(CHUNK)
                    if not b:
                        break
                    g.write(b)
    for path, _, _ in chunks:
        os.remove(path)


def _fetch_to(url, path, byte_range, mode, quiet=False):
    """Append (or write) `url`, or the (start, length) `byte_range` of it, to
    `path`. Returns normally also when the server closes the stream early;
    the caller compares sizes."""
    headers = {'User-Agent': 'cuemol-bench'}
    if byte_range is not None:
        a, n = byte_range
        headers['Range'] = f'bytes={a}-{a + n - 1}'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r, open(path, mode) as f:
        if byte_range is not None and r.status != 206:
            raise RuntimeError(f'{url}: server ignored the byte range (HTTP {r.status})')
        total = int(r.headers.get('Content-Length') or 0)
        done = 0
        last = 0.0
        while True:
            b = r.read(CHUNK)
            if not b:
                break
            f.write(b)
            done += len(b)
            now = time.time()
            if not quiet and now - last > 2.0:
                last = now
                pct = f' {100.0 * done / total:5.1f}%' if total else ''
                print(f'    {done / 1e6:8.1f} MB{pct}', flush=True)


def read_range(url, start, length):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'cuemol-bench',
        'Range': f'bytes={start}-{start + length - 1}',
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        if r.status != 206:
            raise RuntimeError(f'{url}: server ignored the byte range (HTTP {r.status})')
        return r.read()


def tar_member(url, member, hint=None):
    """(data offset, size) of `member` inside an uncompressed tar at `url`.

    Reads only the 512-byte headers, jumping over each member's data, so a
    40 GB archive costs one small request per member. `hint` is the header
    offset recorded in the corpus; it is checked and used when right, which
    skips the walk.
    """
    def header(off):
        h = read_range(url, off, 512)
        name = h[0:100].rstrip(b'\0').decode('latin-1')
        field = h[124:136]
        if field[0] & 0x80:  # GNU base-256 size, for members over 8 GB
            size = int.from_bytes(field[1:], 'big')
        else:
            text = field.rstrip(b'\0 ').decode()
            size = int(text, 8) if text else 0
        return h, name, size

    if hint is not None:
        _, name, size = header(hint)
        if name == member:
            return hint + 512, size
        print(f'    header hint {hint} holds {name!r}, walking the archive instead')
    off = 0
    while True:
        h, name, size = header(off)
        if h == b'\0' * 512:
            raise RuntimeError(f'{member} not found in {url}')
        if name == member:
            return off + 512, size
        off += 512 + ((size + 511) // 512) * 512


def xtc_prefix_length(url, start, frames):
    """Bytes taken by the first `frames` frames of an XTC stored at `start`.

    Each XTC frame is a fixed 92-byte header followed by its compressed
    coordinates, whose byte count sits in the header, so the frames can be
    measured one small request at a time without fetching them.
    """
    pos = 0
    for _ in range(frames):
        h = read_range(url, start + pos, 92)
        magic, natoms = struct.unpack('>ii', h[:8])
        if magic != 1995:
            raise RuntimeError(f'no XTC frame at byte {start + pos} (magic {magic})')
        if natoms <= 9:
            raise RuntimeError('uncompressed XTC frames are not handled')
        nbytes = struct.unpack('>i', h[88:92])[0]
        pos += 92 + ((nbytes + 3) // 4) * 4
    return pos


def fetch_file(spec, out):
    """Download one corpus file: whole, one tar member, or the first frames
    of an XTC tar member."""
    url = spec['url']
    member = spec.get('tarMember')
    if not member:
        download(url, out)
        return
    start, size = tar_member(url, member, spec.get('tarHeaderOffset'))
    frames = spec.get('xtcFrames')
    length = xtc_prefix_length(url, start, frames) if frames else size
    if length > size:
        raise RuntimeError(f'{member}: {frames} frames run past the member')
    what = f'first {frames} frames of {member}' if frames else member
    print(f'    {what}: {length / 1e6:.1f} MB at byte {start}')
    download(url, out, start, length)


def dcd_to_little_endian(src, dst):
    """Rewrite a big-endian DCD as little-endian.

    Every Fortran record marker and every 4-byte word is swapped, except the
    'CORD' magic that opens the header and the title strings, which are text,
    and the 48-byte unit cell record, which holds six doubles.
    """
    part = dst + '.part'
    with open(src, 'rb') as f, open(part, 'wb') as g:
        index = 0
        while True:
            m = f.read(4)
            if not m:
                break
            if len(m) != 4:
                raise ValueError(f'{src}: truncated record marker')
            n = int.from_bytes(m, 'big')
            data = f.read(n)
            end = f.read(4)
            if len(data) != n or int.from_bytes(end, 'big') != n:
                raise ValueError(f'{src}: record {index} is inconsistent; is it big-endian?')
            if index == 0:
                out = data[:4] + swap_words(data[4:], 4)
            elif index == 1:
                out = swap_words(data[:4], 4) + data[4:]
            elif n == 48:
                out = swap_words(data, 8)
            else:
                out = swap_words(data, 4)
            g.write(n.to_bytes(4, 'little'))
            g.write(out)
            g.write(n.to_bytes(4, 'little'))
            index += 1
    os.replace(part, dst)


def swap_words(data, width):
    if len(data) % width:
        raise ValueError(f'record of {len(data)} bytes is not a multiple of {width}')
    out = bytearray(len(data))
    for i in range(width):
        out[i::width] = data[width - 1 - i::width]
    return bytes(out)


def pdb_to_gro(src, dst):
    """Rewrite the ATOM/HETATM records of a PDB as a GRO file, atom for atom.

    Only what the GRO reader uses as topology is carried: residue name, atom
    name, and the position (converted to nm). Residues are renumbered 1..N in
    file order instead of keeping the PDB's numbers, because those are exactly
    what cannot be trusted here: YiiP's seven zinc-site models are all residue
    1 of the same segment, one after another. A new residue starts wherever
    the residue number, name or segment changes, or an atom name repeats
    inside the current one. The box is taken
    from CRYST1 when present; the trajectory frames replace the positions
    anyway, so the precision GRO keeps (0.01 A) does not matter.
    """
    atoms = []
    box = (0.0, 0.0, 0.0)
    with open(src) as f:
        for line in f:
            if line.startswith('CRYST1'):
                box = tuple(float(line[i:i + 9]) / 10.0 for i in (6, 15, 24))
            elif line.startswith(('ATOM', 'HETATM')):
                # A writer that runs out of the four residue columns spills
                # the fifth digit into the insertion-code column (27).
                resfield = line[22:27] if line[26].isdigit() else line[22:26]
                atoms.append((
                    (resfield.strip(), line[17:21].strip(), line[72:76].strip()),
                    line[17:21].strip(),
                    line[12:16].strip(),
                    float(line[30:38]) / 10.0,
                    float(line[38:46]) / 10.0,
                    float(line[46:54]) / 10.0,
                ))
    part = dst + '.part'
    with open(part, 'w') as g:
        g.write(f'converted from {os.path.basename(src)} by fetch-md.py\n')
        g.write(f'{len(atoms):5d}\n')
        resid = 0
        cur_key = None
        cur_names = set()
        for i, (key, resn, name, x, y, z) in enumerate(atoms, start=1):
            if key != cur_key or name in cur_names:
                resid += 1
                cur_key = key
                cur_names = set()
            cur_names.add(name)
            g.write(f'{resid % 100000:5d}{resn[:5]:<5s}{name[:5]:>5s}{i % 100000:5d}'
                    f'{x:8.3f}{y:8.3f}{z:8.3f}\n')
        g.write(f'{box[0]:10.5f}{box[1]:10.5f}{box[2]:10.5f}\n')
    os.replace(part, dst)


DERIVATIONS = {
    'dcd-to-little-endian': dcd_to_little_endian,
    'pdb-to-gro': pdb_to_gro,
}


def fetch_entry(entry):
    """Returns (ok, [file records]) for one corpus entry."""
    eid = entry['id']
    edir = os.path.join(DATA_DIR, eid)
    os.makedirs(edir, exist_ok=True)
    manual = entry.get('source') == 'manual'
    records = []
    ok = True
    for spec in entry['files']:
        name = spec['name']
        out = os.path.join(edir, name)
        if not os.path.exists(out):
            if manual or not spec.get('url'):
                print(f'  {eid}/{name}: missing (manual entry)')
                ok = False
                continue
            print(f'  {eid}/{name}: downloading')
            fetch_file(spec, out)
        else:
            print(f'  {eid}/{name}: present')
        digest = sha256_of(out)
        want = spec.get('sha256')
        if want and digest != want:
            print(f'  {eid}/{name}: SHA-256 MISMATCH\n    want {want}\n    have {digest}')
            ok = False
            continue
        records.append({
            'name': name,
            'bytes': os.path.getsize(out),
            'sha256': digest,
            'pinned': bool(want),
        })
    for spec in entry.get('derived', []):
        if not ok:
            break
        out = os.path.join(edir, spec['name'])
        src = os.path.join(edir, spec['from'])
        if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
            print(f'  {eid}/{spec["name"]}: deriving ({spec["op"]}) from {spec["from"]}')
            DERIVATIONS[spec['op']](src, out)
        else:
            print(f'  {eid}/{spec["name"]}: present (derived)')
        records.append({
            'name': spec['name'],
            'bytes': os.path.getsize(out),
            'sha256': sha256_of(out),
            'derivedFrom': spec['from'],
            'op': spec['op'],
            'pinned': False,
        })
    if manual and not ok:
        print(f'  {eid}: {entry.get("manual", "place the files by hand")}')
    return ok, records


def main(argv):
    with open(CORPUS) as f:
        corpus = json.load(f)
    wanted = set(argv)
    entries = [e for e in corpus['entries'] if not wanted or e['id'] in wanted]
    unknown = wanted - {e['id'] for e in corpus['entries']}
    if unknown:
        print(f'unknown entries: {", ".join(sorted(unknown))}', file=sys.stderr)
        return 2

    os.makedirs(DATA_DIR, exist_ok=True)
    manifest_path = os.path.join(DATA_DIR, 'manifest.json')
    manifest = {'entries': {}}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)

    failed = []
    for entry in entries:
        print(f'{entry["id"]} ({entry["atoms"]} atoms): {entry["description"]}')
        ok, records = fetch_entry(entry)
        if ok:
            manifest['entries'][entry['id']] = {
                'atoms': entry['atoms'],
                'source': entry['source'],
                'license': entry.get('license'),
                'files': records,
            }
        else:
            failed.append(entry['id'])

    manifest['fetched'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print(f'Wrote {os.path.relpath(manifest_path, HERE)}')
    if failed:
        print(f'Incomplete: {", ".join(failed)}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
