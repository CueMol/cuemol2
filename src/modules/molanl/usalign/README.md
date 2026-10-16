# US-align (vendored)

Upstream: https://github.com/pylelab/USalign
Commit: `746ad8a2a4dea9f317075cc482df0ecb5440bdea` (2026-10-12)
License: see `LICENSE` (permissive; the notices at the head of each file,
the reference information and the copyright notice must be kept).

Only the headers needed by the monomer TM-align path (`TMalign_main`) are
copied: `basic_fun.h`, `param_set.h`, `NW.h`, `Kabsch.h`, `NWalign.h`,
`BLOSUM.h`, `TMalign.h`. `USalign.cpp` (the CLI `main`) and the multimer /
flexible / SOI code are not included.

The headers define non-inline functions and `using namespace std;`, so they
are included by exactly one translation unit, `../USalignImpl.cpp`, inside
`namespace usalign_vendor`.

## Local patches

- `basic_fun.h`: `#include "pstream.h"` -> `#include "pstream_stub.h"`.
  `pstream.h` is POSIX only and is used only by the file readers, which
  CueMol does not call.
- `basic_fun.h`: `PrintErrorAndQuit()` throws `std::runtime_error` instead of
  calling `exit(1)`.
- `TMalign.h`: the 7 variable-length arrays (`k_ali`, `L_ini`, `i_ali`, `dis`;
  a GCC/clang extension that MSVC rejects) are `std::vector`s, with `.data()` /
  iterators where they were used as pointers. Marked `CueMol patch` in place.
  Check with `-Wvla-extension` (clang) after an update.

To update, copy the same headers from a newer upstream commit, re-apply the
patches above, update the commit hash here, and re-check the test baselines in
`src/tests/modules/molanl/test_usalign_superpose.cpp`.
