//
//
//

var EXPORTED_SYMBOLS = ["require", "gHarness"];

// ------------------------------
// From bootstrap.js of addon-sdk
// ------------------------------

// For more information on the context in which this script is executed, see:
// https://developer.mozilla.org/en/Extensions/Bootstrapped_extensions

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

// Object containing information about the XPCOM harness service
// that manages our addon.

var gHarness;

var ios = Cc['@mozilla.org/network/io-service;1']
          .getService(Ci.nsIIOService);

var manager = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

// Dynamically evaluate and initialize the XPCOM component in
// components/harness.js, which bootstraps our addon. (We want to keep
// components/harness.js around so that versions of Gecko that don't
// support rebootless addons can still work.)

function setupHarness(installPath, loadReason) {
  var harnessJs = installPath.clone();
  // harnessJs.append("components");
  harnessJs.append("modules");
  harnessJs.append("harness.js");
  var path = ios.newFileURI(harnessJs).spec;
  var harness = {};
  var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
               .getService(Ci.mozIJSSubScriptLoader);
  dump("loader.loadSubScript: "+path+"\n");
  loader.loadSubScript(path, harness);
  dump("loader.loadSubScript: "+path+" OK\n");

  var HarnessService = harness.buildHarnessService(installPath);
  var factory = HarnessService.prototype._xpcom_factory;
  var proto = HarnessService.prototype;

  // We want to keep this factory around for the lifetime of
  // the addon so legacy code with access to Components can
  // access the addon if needed.
  manager.registerFactory(proto.classID,
                          proto.classDescription,
                          proto.contractID,
                          factory);

  var harnessService = factory.createInstance(null, Ci.nsISupports);
  harnessService = harnessService.wrappedJSObject;

  gHarness = {
    service: harnessService,
    classID: proto.classID,
    contractID: proto.contractID,
    factory: factory
  };

  if (loadReason == "startup")
    // Simulate a startup event; the harness service will take care of
    // waiting until the app is ready for the extension's code to run.
    harnessService.observe(null, "profile-after-change", null);
  else
    harnessService.load(loadReason);
}

// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


dump("******** modules/appboots.js executing ********** \n");

var resProt = ios.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
dump("******** resProt = "+ resProt +"\n");

var fileProt = ios.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
var greURI = resProt.getSubstitution("gre");
dump("******** greURI.spec = "+ greURI.spec +"\n");
// var appURI = resProt.getSubstitution("app");
// dump("******** appURI.spec = "+ appURI.spec +"\n");

// var installPath = fileProt.getFileFromURLSpec(appURI.spec);
var installPath = fileProt.getFileFromURLSpec(greURI.spec);
dump("******** InstallPath = "+ installPath.path +"\n");

// var dirsvc = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
// var curproc_dir = dirsvc.get("CurProcD", Ci.nsIFile);
// var installPath = curproc_dir;

dump("******** InstallPath = "+ installPath.path +"\n");

if (!gHarness) {
  setupHarness(installPath, "enable");
}

function require(a) {
  return gHarness.service.loader.require(a);
}

dump("******** setupHarness OK, gHarness = "+ gHarness +"\n");
