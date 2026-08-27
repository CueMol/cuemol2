# Object Reader Content Sniff

How CueMol picks an `ObjReader` when a file's extension is ambiguous
or absent. Each reader opts into a tri-state inspection of the file's
leading bytes; this document defines the contract, the escalating
byte-budget mechanism, and the implementation patterns shared by every
reader.

## Why content sniff exists

Several file formats CueMol supports share extensions:

- `.map` covers CCP4, XPLOR, BRIX, OpenDX, ...
- `.cif` covers mmCIF coordinate and mmCIF structure-factor files.
- The "All files" filter in the open dialog must dispatch arbitrary
  extensions, including no extension at all.

Sniff resolves the ambiguity: the first reader to claim
`CONTENT_YES` wins; readers can also explicitly disclaim by returning
`CONTENT_NO`; the default is `CONTENT_UNKNOWN` (no opinion).

## Reader contract

Defined on `qsys::ObjReader` (`src/qsys/ObjReader.hpp`):

```cpp
enum {
  CONTENT_NO      = 0,   // recognised as another format
  CONTENT_YES     = 1,   // this reader can handle it
  CONTENT_UNKNOWN = 2,   // no opinion (insufficient data / not mine)
};

virtual int canHandleContent(qlib::InStream &ins) const {
  return CONTENT_UNKNOWN;   // default for readers that do not sniff
}
```

Three rules every implementation must follow:

1. **Read what you need, no more.** Read just enough to fingerprint
   the format -- a magic byte sequence, a header line, or a keyword
   scan until verdict.
2. **Be cap-agnostic.** Callers wrap `ins` in a `LimitedInStream`
   that returns EOF once a byte budget is exhausted. If you cannot
   decide within the budget, return `CONTENT_UNKNOWN`; the harness
   will call you again with a larger budget when the budget (not the
   file) is what stopped you. Never assume a specific window size;
   never pre-buffer arbitrary amounts.
3. **NO is final, so it must be prefix-monotone.** The harness never
   retries a reader that said `CONTENT_NO`. A `LimitedInStream` is a
   true prefix of the stream, and a `LineStream` over it is a true
   prefix except for its *last line*, which may be cut short. A test
   that succeeds on a prefix (`startsWith`, a fixed offset, a byte
   that is actually present) also succeeds on the complete input, so
   deciding YES / NO on it is safe. A test that *fails* on a cut line
   (`equals`, line length, numeric parse, "the next line is missing")
   is a false negative under truncation: fall through to
   `CONTENT_UNKNOWN`, never `CONTENT_NO`.

Returning `CONTENT_NO` is reserved for readers that **positively
identify a competing format** (e.g. `MmcifMapReader` sees
`_atom_site.` and says NO). Binary input on a text reader, a malformed
line, or any "not mine" feeling, is `CONTENT_UNKNOWN`, not
`CONTENT_NO`. See the decision table below.

## Sniff entry points

Two callers drive sniff from C++ today:

| Caller                                  | Location                                      |
|-----------------------------------------|-----------------------------------------------|
| `StreamManager::searchReaderByContent`  | `src/qsys/StreamManager.cpp`                  |
| `LoadObjectCommand` (content-first)     | `src/qsys/command/LoadObjectCommand.cpp`      |

Internal pipeline (see `sniffWithChain` and `searchByContentImpl` in
`StreamManager.cpp`):

```
caller (path, maxBytes = ceiling)
  budget = SNIFF_INITIAL_BYTES (64 KiB)
  loop:
    for each candidate still pending:
      -> FileInStream
      -> (Gzip / Xz decompressor, if compression magic detected)
      -> LimitedInStream(stream, budget)
      -> reader.canHandleContent(stream)
      YES                          -> done (first-only) / collect (multi)
      UNKNOWN && lim.isLimitHit()  -> keep pending
      NO / UNKNOWN at EOF / early UNKNOWN / exception -> final
    stop when nothing is pending or budget >= ceiling
    budget *= SNIFF_GROWTH_FACTOR (8), clamped to the ceiling
```

`sniffWithChain` opens a fresh stream per candidate reader and per
round because `canHandleContent` does not rewind (the decompressors
are not seekable). The OS page cache makes repeated reads cheap, and
only readers that were actually cut off pay for another round.

## The byte budget

`LimitedInStream` (`src/qlib/LimitedInStream.hpp`) caps reads to N
bytes total, returns EOF on overage, and records whether the budget
was the limiting factor: `isLimitHit()` is true when the budget ran
out or a read / skip request had to be refused or shortened, and
false when the reader stopped on its own (source EOF, early verdict)
with budget to spare. The harness uses `verdict == UNKNOWN &&
isLimitHit()` as the "retry with more" signal.

The budget escalates instead of being a flat cap
(`StreamManager::SNIFF_INITIAL_BYTES` / `SNIFF_GROWTH_FACTOR`):

- Round 1 gives every candidate 64 KiB. Readers that decide in a few
  bytes (magic numbers) or one `LineStream` block (2 KB) read only
  that much -- the budget is an upper bound, not a pre-read.
- A candidate whose `UNKNOWN` was caused by the budget is retried
  with 8x more: 64 KiB, 512 KiB, 4 MiB, 32 MiB, ... Everything else
  is final after its first call.
- `maxBytes` is the **ceiling** of that growth; the last round is
  clamped to it. `0` means no ceiling: grow until every pending reader
  reaches EOF or a verdict. A ceiling below 64 KiB is a single round
  at the ceiling.
- Cost: each round re-opens the file, so the bytes read for one reader
  sum to at most 8/7 of the deciding round's budget (plus the
  ceiling-clamped final round). With the tritium ceiling that is
  64K + 512K + 4M + 16M, about 1.3 x 16 MiB, and only for a reader
  that never decides.
- First-only search is round-major: a reader that says YES in round 1
  wins even if a reader earlier in ABI-name order is still pending.
  ABI order is not a priority, and two readers claiming the same file
  is a reader-side conflict, so this is acceptable.
- A file exactly as long as a budget, or a decisive UNKNOWN within
  2 KB of the budget (LineStream's read-ahead block), costs one extra
  harmless round.

`LineStream::readLine` scans only the bytes appended by each block
when looking for the delimiter, so a delimiter-free run (a minified
JSON or base64 blob dropped on a text reader) is linear in its length.
Raising the ceiling relies on this: a 16 MiB single line would
otherwise rescan its buffer 8000 times.

Policy layers:

| Layer                                       | Default            | Set in                                                              |
|---------------------------------------------|--------------------|---------------------------------------------------------------------|
| `LoadObjectCommand.max_sniff_bytes` (qif)   | `0` (no ceiling)   | `src/qsys/command/LoadObjectCommand.qif`                            |
| Tritium `pickReaderName` ceiling            | `16 MiB`           | `tritium/react-gui/src/renderer/worker/shared/sniffConfig.ts`       |

Raw C++ callers and UXP scripted paths see the no-ceiling default so
existing flows are unaffected. Tritium never uses that mode:
`pickReaderName` passes `DEFAULT_SNIFF_CAP` to `searchReaderByContent`
and maps an explicit `0` to the same default (it resolves the reader
itself and does not go through `LoadObjectCommand`), so a pathological
1 GB file opened via tritium costs at most ~20 MiB of reads per
undecidable reader.

## Implementation patterns

### Text readers: LineStream loop

```cpp
int FooReader::canHandleContent(qlib::InStream &ins) const
{
  qlib::LineStream lin(ins);
  while (lin.ready()) {
    LString line = lin.readLine().trim(" \t\r\n");
    if (line.startsWith("FOO ")) return CONTENT_YES;
    if (line.startsWith("BAR ")) return CONTENT_NO;   // optional
  }
  return CONTENT_UNKNOWN;
}
```

`LineStream::ready()` returns false at EOF, which includes the budget
firing on `LimitedInStream`. No per-reader peek size; the marker can
land arbitrarily deep within the prefix. `XplorMapReader` is the
extreme case in the current codebase -- the `ZYX` axis marker is
preceded by up to ~5 KB of `REMARKS` lines in real CNS maps; the
LineStream loop walks past them without any tuning.

Note the `CONTENT_NO` line above is only correct because `startsWith`
is prefix-monotone (rule 3). A whole-line `equals()` for YES is a
(small) false-positive risk on a cut line -- `MOL2MolReader` and
`PLYFileReader` carry this today -- and an `equals()` / length /
numeric check must never produce NO.

### Binary readers: minimum-byte direct read

```cpp
int FooReader::canHandleContent(qlib::InStream &ins) const
{
  constexpr int N = 12;       // smallest prefix the format needs
  char buf[N];
  int n = ins.read(buf, 0, N);
  if (n < N) return CONTENT_UNKNOWN;    // short read -> cannot decide
  if (memcmp(buf, "FOO\0\0\0\0\0", 8) == 0) return CONTENT_YES;
  return CONTENT_UNKNOWN;
}
```

Read once, decide once. Do not pre-allocate "headroom" hoping later
bytes will help -- if the format's magic is at byte 0, the read is
12 bytes; if it is at byte 208 (CCP4), the read is 212.

`CONTENT_NO` from a binary reader is appropriate only when the prefix
positively matches a competing format. That is rare.

### Binary readers: IEEE sanity check (no magic bytes)

A few binary formats lack any header magic but their leading fields
are structurally constrained -- for example, a small positive `int32`
count followed by IEEE `float64` coordinates. In that case, read the
fixed-size prefix, then accept only if **all** of the following hold
under **either** native or byte-swapped interpretation:

- the leading integer count is positive and within a plausible upper
  bound,
- every float field is `std::isfinite` (rules out NaN/Inf),
- every float field's magnitude is within a domain-specific cap.

Stray ASCII or unrelated binary input fails the float-sanity check
almost certainly, so the false-positive risk is low. The
endian-pair retry mirrors the runtime swap-detection that the
reader's `read()` already performs. `NAMDCoorReader::canHandleContent`
implements this pattern.

## Decision table: NO vs UNKNOWN

Reader layer -- a reader inspecting content is in one of three states:

| Situation                                                                    | Verdict           |
|------------------------------------------------------------------------------|-------------------|
| Positive marker for this format                                              | `CONTENT_YES`     |
| Positive marker for a *different* format (prefix-monotone test)              | `CONTENT_NO`      |
| Nothing matched: EOF, budget hit, malformed / cut line, binary on text reader | `CONTENT_UNKNOWN` |

Harness layer -- what `searchByContentImpl` does with the verdict:

| Verdict                                   | `LimitedInStream::isLimitHit()` | Action                          |
|-------------------------------------------|---------------------------------|---------------------------------|
| `CONTENT_YES`                             | any                             | hit (final)                     |
| `CONTENT_NO`                              | any                             | final, not retried              |
| `CONTENT_UNKNOWN`                         | true (budget ended the scan)    | retry with 8x budget, up to the ceiling |
| `CONTENT_UNKNOWN`                         | false (EOF or early stop)       | final, not retried              |
| exception / open failure                  | --                              | final `UNKNOWN`                 |

The historical pitfall is using `CONTENT_NO` too eagerly -- e.g.
declaring NO on any binary input from a text reader, or NO because
the third line was too short (which a budget can cause). That makes
readers fight each other on unusual inputs and hides files from the
retry. The rule: NO is for **positive identification of a different
format** by a prefix-monotone test, never as "not mine".

## Adding sniff to a new reader

1. Pick text or binary pattern from above.
2. Identify the smallest unambiguous fingerprint:
   - A keyword line (text), or
   - A magic byte sequence (binary), or
   - A header offset value (binary, late).
3. Add `canHandleContent` override to the reader's `.hpp` declaration
   and `.cpp` definition.
4. Add `src/tests/modules/<area>/test_<reader>_sniff.cpp` covering
   at minimum:
   - YES on a real exemplar payload.
   - UNKNOWN on a random / empty / very-short payload.
   - UNKNOWN (not NO) when wrapped in a `LimitedInStream` whose
     budget fires before the marker, and `isLimitHit()` true on the
     wrapper (for text readers where the marker can be pushed deep;
     see `test_xplormap_sniff.cpp` / `test_gro_sniff.cpp`).
   - NO when fed payloads of an unambiguously competing format
     (only if the reader returns NO in any branch). Check that every
     NO branch is a prefix-monotone test (rule 3); a cut last line
     must yield UNKNOWN.
5. Register the test in `src/tests/CMakeLists.txt` (follow existing
   `test_*_sniff.cpp` entries).
6. Rebuild and run `task run_gtest`.

The reader's existing `read()` path is untouched. `canHandleContent`
is read-only and lives parallel to `read()`.

## Readers without sniff coverage

`PsfReader` (`src/modules/mdtools/PsfReader.cpp`) is not a
`qsys::ObjReader` subclass; it is an internal helper used only from
`NAMDCoorReader::loadTopology()` to consume a `"topo"` sub-stream.
It has no entry in the file-type registry and never reaches the
sniff chain, so no `canHandleContent` is added.

## Related files

- `src/qsys/ObjReader.hpp` -- contract definition
- `src/qsys/StreamManager.cpp` -- `sniffWithChain`, `searchByContentImpl` (escalation loop)
- `src/qsys/command/LoadObjectCommand.cpp` -- content-first dispatch
- `src/qlib/LimitedInStream.hpp` -- byte-budget stream adaptor with `isLimitHit()`
- `src/qlib/LineStream.hpp` / `.cpp` -- line-oriented adaptor for text readers (linear delimiter scan)
- `tritium/react-gui/src/renderer/worker/shared/sniffConfig.ts` -- tritium ceiling
- `tritium/react-gui/src/renderer/worker/server/services/helpers/pickReaderName.ts` -- tritium call site
- `src/tests/qsys/test_stream_manager_sniff_escalation.cpp` -- escalation loop pinned with scripted fake readers
- `src/tests/qlib/test_limited_in_stream.cpp`, `test_line_stream.cpp` -- stream adaptors
- `src/tests/modules/importers/test_*_sniff.cpp` -- per-reader examples
