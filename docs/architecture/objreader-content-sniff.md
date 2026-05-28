# Object Reader Content Sniff

How CueMol picks an `ObjReader` when a file's extension is ambiguous
or absent. Each reader opts into a tri-state inspection of the file's
leading bytes; this document defines the contract, the byte-cap
mechanism, and the implementation patterns shared by every reader.

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

Two rules every implementation must follow:

1. **Read what you need, no more.** Read just enough to fingerprint
   the format -- a magic byte sequence, a header line, or a keyword
   scan until verdict.
2. **Be cap-agnostic.** Callers may wrap `ins` in a
   `LimitedInStream` that returns EOF once a byte budget is exhausted.
   If you cannot decide within the cap, return `CONTENT_UNKNOWN`.
   Never assume a specific window size; never pre-buffer arbitrary
   amounts.

Returning `CONTENT_NO` is reserved for readers that **positively
identify a competing format** (e.g. CCP4 sees XPLOR text and says
NO). Binary input on a text reader, or any "not mine" feeling, is
`CONTENT_UNKNOWN`, not `CONTENT_NO`. See the decision table below.

## Sniff entry points

Two callers drive sniff from C++ today:

| Caller                                  | Location                                      |
|-----------------------------------------|-----------------------------------------------|
| `StreamManager::searchReaderByContent`  | `src/qsys/StreamManager.cpp`                  |
| `LoadObjectCommand` (content-first)     | `src/qsys/command/LoadObjectCommand.cpp`      |

Internal pipeline (see `sniffWithChain` in `StreamManager.cpp`):

```
caller (path, maxBytes)
  -> FileInStream
  -> (Gzip / Xz decompressor, if compression magic detected)
  -> LimitedInStream(stream, maxBytes)        // only if maxBytes > 0
  -> reader.canHandleContent(stream)
```

`sniffWithChain` opens a fresh stream per candidate reader because
`canHandleContent` does not rewind. The OS page cache makes repeated
reads cheap.

## The byte cap

`LimitedInStream` (`src/qlib/LimitedInStream.hpp`) caps reads to N
bytes total and returns EOF on overage. There are two policy layers:

| Layer                                       | Default          | Set in                                                              |
|---------------------------------------------|------------------|---------------------------------------------------------------------|
| `LoadObjectCommand.max_sniff_bytes` (qif)   | `0` (unbounded)  | `src/qsys/command/LoadObjectCommand.qif`                            |
| Tritium service-side override               | `65536` (64 KB)  | `tritium/react-gui/src/renderer/worker/shared/sniffConfig.ts`       |

Raw C++ callers and UXP scripted paths see the unbounded default so
existing flows are unaffected. Tritium services pass
`DEFAULT_SNIFF_CAP` explicitly when calling `searchReaderByContent`
and when populating `LoadObjectCommand.max_sniff_bytes`, so a
pathological 1 GB file opened via tritium sees at most 64 KB scanned
per reader.

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

`LineStream::ready()` returns false at EOF, which includes the cap
firing on `LimitedInStream`. No per-reader peek size; the marker can
land arbitrarily deep within the prefix. `XplorMapReader` is the
extreme case in the current codebase -- the `ZYX` axis marker is
preceded by up to ~5 KB of `REMARKS` lines in real CNS maps; the
LineStream loop walks past them without any tuning.

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

A reader inspecting content is in one of three states:

| Situation                                                            | Verdict           |
|----------------------------------------------------------------------|-------------------|
| Positive marker for this format                                      | `CONTENT_YES`     |
| Positive marker for a *different* format                             | `CONTENT_NO`      |
| Nothing matched, including EOF, cap-hit, or binary input on a text reader | `CONTENT_UNKNOWN` |

The historical pitfall is using `CONTENT_NO` too eagerly -- e.g.
declaring NO on any binary input from a text reader. That makes
readers fight each other on unusual inputs. The rule: NO is for
**positive identification of a different format**, never as "not mine".

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
   - UNKNOWN when wrapped in a `LimitedInStream` whose cap fires
     before the marker (for text readers where the marker can be
     pushed deep).
   - NO when fed payloads of an unambiguously competing format
     (only if the reader returns NO in any branch).
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
- `src/qsys/StreamManager.cpp` -- `sniffWithChain`, `searchByContentImpl`
- `src/qsys/command/LoadObjectCommand.cpp` -- content-first dispatch
- `src/qlib/LimitedInStream.hpp` -- byte-cap stream adaptor
- `src/qlib/LineStream.hpp` -- line-oriented adaptor for text readers
- `tritium/react-gui/src/renderer/worker/shared/sniffConfig.ts` -- tritium cap
- `src/tests/modules/importers/test_*_sniff.cpp` -- examples
