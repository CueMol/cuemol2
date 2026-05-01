// CommonJS entry point for @cuemol/core (loaded via the "require" export
// condition in package.json).  Must be .cjs because the package uses
// "type": "module".
//
// bindings() walks up from __dirname (core/src/) to find core/package.json,
// then locates build/Release/cuemol_internal.node relative to the package
// root.  Exposing getModule() keeps the API consistent with the ESM entry
// point (src/index.ts).
const bindings = require('bindings')
const _internal = bindings('cuemol_internal.node')

exports.getModule = function () { return _internal }
