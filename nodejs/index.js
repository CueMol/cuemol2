let cm = require("bindings")("cuemol_internal.node");
console.log("Hello! node.js");

cm.hello();
cm.initCueMol();

console.log("Vector: "+cm.hasClass("Vector"));
let v = cm.createObj("Vector", "(1, 2, 3)");

console.log("Vector: "+v);
