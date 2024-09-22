const path = require('path');
const _internal = require('bindings')('cuemol_internal.node');
const { CueMol, EventManager } = require('./cuemol');
console.log("_internal: ", _internal);

// function getModule() {
//   return _internal;
// }

exports.getModule = function () {
  return _internal;
};

exports.getSysConfigPath = function () {
  // console.log('XXX path.resolve:',path.resolve('.'));
  // console.log('XXX __filename:', __filename);
  // console.log('XXX __dirname:', __dirname);
  const load_path = path.join(__dirname, 'build', 'data', 'sysconfig.xml');
  console.log('load_path:', load_path);
  return load_path;
};

let cuemol = null;

exports.createCueMol = function (sysconfig_path = '') {
  if (cuemol) {
    console.log('cuemol already created');
    return cuemol;
  }
  cuemol = new CueMol({internal: _internal});
  if (!sysconfig_path) {
    cuemol.initCueMol();
    // cuemol.initCueMol(exports.getSysConfigPath());
  }
  else {
    cuemol.initCueMol(sysconfig_path);
  }
  return cuemol;
};

let event_manager = null;

exports.getEventManager = function() {
  if (cuemol === null) {
    console.log('cuemol not created');
    return null;
  }
  if (event_manager) {
    return event_manager;
  }
  else {
    event_manager = new EventManager(cuemol);
    return event_manager;
  }
};
