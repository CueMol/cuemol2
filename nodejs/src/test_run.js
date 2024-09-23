// const core = require('./index.js');
import * as core from './index.js';
console.log('***** test', core);

const ci = core.getModule()
console.log('cuemol internal: ', ci);

const cm = core.createCueMol();
console.log('cuemol: ', cm);

let v = cm.createObj('Vector');
v.strvalue = "(4, 5, 6.28)";
console.log('v: ', v.strvalue);

let v2 = cm.createObj('Vector');
v2.set4(1, 2, 3, 4);
console.log('v2: ', v2.strvalue);

let v3 = v.sub(v2);
console.log('v3: ', v3.strvalue);
