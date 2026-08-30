# Inspector parity fixtures

`rendererProps.json` is what the real C++ reports, captured once:

- a scene with 1CRN (`tests/test_data/1CRN.pdb`) and one renderer of each
  molecule type, plus an empty `DensityMap` for the three map types;
- each renderer's `getPropsJSON()` run through `parseGenericProps`, so the
  rows -- including the dot-path children of nested objects like `helix.type`
  -- are exactly what the Properties tab receives at runtime.

Two captured values were not finite: an empty `DensityMap` has no statistics,
so a map renderer's level / min / max came back as `inf` / `nan`, which is not
JSON. They were replaced with plausible finite numbers. Every other value is
verbatim.

## Re-capturing

Only needed when C++ gains or renames a renderer property. Run a throwaway
Jest test in `tritium/core` (it can load the native addon directly):

```ts
// tritium/core/src/tests/scratch/dump.test.ts
import * as fs from 'fs';
import { cm } from '../setup';
// create a scene, load 1CRN through the 'pdb' reader, then for each type:
//   const r = mol.createRenderer(type);
//   out[type] = JSON.parse(r.getPropsJSON().replace(/:\s*-?inf\b/g, ': 1.0')
//                                          .replace(/:\s*-?nan\b/g, ': 0.0'));
```

```sh
cd tritium/core
NODE_OPTIONS="--experimental-vm-modules --no-warnings --expose-gc" \
  npx jest --runInBand src/tests/scratch/dump.test.ts
```

Then flatten the result with `parseGenericProps` and write it here. Re-record
the snapshots afterwards (`npx vitest run rendererSectionParity -u`) and read
the diff: a changed row is a change to the page, not noise.
