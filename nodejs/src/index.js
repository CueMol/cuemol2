// const path = require('path');
// const _internal = require('bindings')('cuemol_internal.node');
// const { CueMol, EventManager } = require('./cuemol');
import path from 'path';
import bindings from 'bindings';
const _internal = bindings('cuemol_internal.node');
import { CueMol, EventManager } from './cuemol.js';

const cuemol = {'value': null};

console.log("bindings: ", bindings);
console.log("bindings('cuemol_internal.node'): ", bindings('cuemol_internal.node'));
console.log("_internal: ", _internal);

// exports.getModule = function () {
export function getModule() {
  return _internal;
};

// exports.getSysConfigPath = function () {
export function getSysConfigPath() {
  // console.log('XXX path.resolve:',path.resolve('.'));
  // console.log('XXX __filename:', __filename);
  // console.log('XXX __dirname:', __dirname);
  const load_path = path.join(__dirname, 'build', 'data', 'sysconfig.xml');
  console.log('load_path:', load_path);
  return load_path;
};

// exports.createCueMol = function (sysconfig_path = '') {
export function createCueMol(sysconfig_path = '') {
  if (cuemol.value) {
    console.log('cuemol already created');
    return cuemol;
  }
  cuemol.value = new CueMol({internal: _internal});
  cuemol.value.initCueMol(sysconfig_path);
  return cuemol.value;
};

let event_manager = null;

// exports.getEventManager = function() {
export function getEventManager() {
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
