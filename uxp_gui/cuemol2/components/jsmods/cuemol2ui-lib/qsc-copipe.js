//
//
//

const {Cc,Ci} = require("chrome");
const errors = require("errors");
const apiUtils = require("api-utils");
 
const debug_util = require("debug_util");
const dd = debug_util.dd;
const cuemol = require("cuemol");

/*
While these data flavors resemble Internet media types, they do
no directly map to them.
*/
const kAllowableFlavors = [
  "text/unicode",
  "text/html",
  "application/x-cuemol2-scenexml-rend",
  "application/x-cuemol2-scenexml-rend-array",
  "application/x-cuemol2-scenexml-obj",
  "application/x-cuemol2-scenexml-obj-array",
  "application/x-cuemol2-scenexml-cam",
  "application/x-cuemol2-scenexml-cam-array",
  "application/x-cuemol2-scenexml-style",
  "application/x-cuemol2-scenexml-style-array",
  "application/x-cuemol2-json-paint"
];

/*
Aliases for common flavors. Not all flavors will
get an alias. New aliases must be approved by a
Jetpack API druid.
*/
const kFlavorMap = [
  { short: "text", long: "text/unicode" },
  { short: "html", long: "text/html" },
  { short: "imagefilepng", long: "image/png" },
  { short: "qscrend", long: "application/x-cuemol2-scenexml-rend" },
  { short: "qscrendary", long: "application/x-cuemol2-scenexml-rend-array" },
  { short: "qscobj", long: "application/x-cuemol2-scenexml-obj" },
  { short: "qscobjary", long: "application/x-cuemol2-scenexml-obj-array" },
  { short: "qsccam", long: "application/x-cuemol2-scenexml-cam" },
  { short: "qsccamary", long: "application/x-cuemol2-scenexml-cam-array" },
  { short: "qscsty", long: "application/x-cuemol2-scenexml-style" },
  { short: "qscstyary", long: "application/x-cuemol2-scenexml-style-array" },
  { short: "qscpaint", long: "application/x-cuemol2-json-paint" }
];

let clipboardService = Cc["@mozilla.org/widget/clipboard;1"].
                       getService(Ci.nsIClipboard);

let clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].
                      getService(Ci.nsIClipboardHelper);


exports.set = function(aData, aDataType) {
  let options = {
    data: aData,
    datatype: aDataType || "text"
  };

  var flavor = fromJetpackFlavor(options.datatype);

  if (!flavor)
    throw new Error("Invalid flavor");

  // Additional checks for using the simple case
  if (flavor == "text/unicode") {
    clipboardHelper.copyString(options.data);
    return true;
  }

  // Below are the more complex cases where we actually have to work with a
  // nsITransferable object
  var xferable = Cc["@mozilla.org/widget/transferable;1"].
                 createInstance(Ci.nsITransferable);
  if (!xferable)
    throw new Error("Couldn't set the clipboard due to an internal error " + 
                    "(couldn't create a Transferable object).");

  dd("Copipe set() flavor="+flavor);

  switch (flavor) {
    case "text/html":
      var str = Cc["@mozilla.org/supports-string;1"].
                createInstance(Ci.nsISupportsString);
      str.data = options.data;
      xferable.addDataFlavor(flavor);
      xferable.setTransferData(flavor, str, options.data.length * 2);
      break;

    // Set images to the clipboard is not straightforward, to have an idea how
    // it works on platform side, see:
    // http://mxr.mozilla.org/mozilla-central/source/content/base/src/nsCopySupport.cpp?rev=7857c5bff017#530
  case "image/png":
    let imgfile = options.data;
    
    let container = {};
    
    try {
      let inputStream = Cc['@mozilla.org/network/file-input-stream;1']
	.createInstance(Ci.nsIFileInputStream);
      inputStream.init(imgfile, 1, -1, null);
      
      var bis = Cc["@mozilla.org/network/buffered-input-stream;1"].
	createInstance(Ci.nsIBufferedInputStream);
      bis.init(inputStream, 1024);

      var imageTools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);
      imageTools.decodeImageData(bis, flavor, container);
    }
    catch (e) {
      throw new Error("Unable to decode data given in a valid image.");
    }

    // Store directly the input stream makes the cliboard's data available
    // for Firefox but not to the others application or to the OS. Therefore,
    // a `nsISupportsInterfacePointer` object that reference an `imgIContainer`
    // with the image is needed.
    var imgPtr = Cc["@mozilla.org/supports-interface-pointer;1"].
      createInstance(Ci.nsISupportsInterfacePointer);
    
    imgPtr.data = container.value;
    
    xferable.addDataFlavor(flavor);
    xferable.setTransferData(flavor, imgPtr, -1);

    break;

  case "application/x-cuemol2-scenexml-rend":
  case "application/x-cuemol2-scenexml-obj": 
  case "application/x-cuemol2-scenexml-cam":
  case "application/x-cuemol2-scenexml-style":
  case "application/x-cuemol2-scenexml-rend-array": {

    var str = Cc["@mozilla.org/supports-string;1"].
      createInstance(Ci.nsISupportsString);

    let xmlstr = cuemol.xpc.convBAryToStr(options.data._wrapped);
    str.data = xmlstr;
    xferable.addDataFlavor(flavor);
    xferable.setTransferData(flavor, str, xmlstr.length * 2);

    break;
  }

  case "application/x-cuemol2-json-paint": {

    // paint entry is simple json string
    var str = Cc["@mozilla.org/supports-string;1"].
      createInstance(Ci.nsISupportsString);
    str.data = options.data;
    xferable.addDataFlavor(flavor);
    xferable.setTransferData(flavor, str, options.data.length * 2);

    break;
  }

    // TODO: add a text/unicode flavor for HTML text that
    // returns a plaintextified representation of the HTML.
  default:
    throw new Error("Unable to handle the flavor " + flavor + ".");
  }

  // TODO: Not sure if this will ever actually throw. -zpao
  try {
    clipboardService.setData(
      xferable,
      null,
      clipboardService.kGlobalClipboard
    );
  } catch (e) {
    throw new Error("Couldn't set clipboard data due to an internal error: " + e);
  }
  return true;
};

exports.get = function(aDataType)
{
  let options = {
    datatype: aDataType || "text"
  };
  options = apiUtils.validateOptions(options, {
    datatype: {
      is: ["string"]
    }
  });

  var xferable = Cc["@mozilla.org/widget/transferable;1"].
                 createInstance(Ci.nsITransferable);
  if (!xferable)
    throw new Error("Couldn't set the clipboard due to an internal error " + 
                    "(couldn't create a Transferable object).");

  var flavor = fromJetpackFlavor(options.datatype);

  // Ensure that the user hasn't requested a flavor that we don't support.
  if (!flavor)
    throw new Error("Getting the clipboard with the flavor '" + flavor +
                    "' is > not supported.");

  // TODO: Check for matching flavor first? Probably not worth it.

  xferable.addDataFlavor(flavor);

  // Get the data into our transferable.
  clipboardService.getData(
    xferable,
    clipboardService.kGlobalClipboard
  );

  var data = {};
  var dataLen = {};
  try {
    xferable.getTransferData(flavor, data, dataLen);
  }
  catch (e) {
    // Clipboard doesn't contain data in flavor, return null.
    return null;
  }

  // There's no data available, return.
  if (data.value === null)
    return null;

  dd("Copipe get() flavor="+flavor);

  // TODO: Add flavors here as we support more in kAllowableFlavors.
  switch (flavor) {
  case "text/unicode":
  case "text/html":
    data = data.value.QueryInterface(Ci.nsISupportsString).data;
    break;
    
  case "application/x-cuemol2-scenexml-rend":
  case "application/x-cuemol2-scenexml-obj": 
  case "application/x-cuemol2-scenexml-style": 
  case "application/x-cuemol2-scenexml-cam": {
    let str = data.value.QueryInterface(Ci.nsISupportsString).data;
    data = cuemol.convPolymObj( cuemol.xpc.createBAryFromStr(str) );
    break;
  }    

  case "application/x-cuemol2-scenexml-rend-array": {
    let str = data.value.QueryInterface(Ci.nsISupportsString).data;
    data = cuemol.convPolymObj( cuemol.xpc.createBAryFromStr(str) );
    break;
  }

  case "application/x-cuemol2-json-paint": {
    // paint entry is encoded as a simple json string
    data = data.value.QueryInterface(Ci.nsISupportsString).data;
    break;
  }    

  default:
    data = null;
  }

  return data;
};

exports.check = function(aDataType)
{
  let options = {
    datatype: aDataType || "text"
  };
  options = apiUtils.validateOptions(options, {
    datatype: {
      is: ["string"]
    }
  });

  var xferable = Cc["@mozilla.org/widget/transferable;1"].
                 createInstance(Ci.nsITransferable);
  if (!xferable)
    throw new Error("Couldn't set the clipboard due to an internal error " + 
                    "(couldn't create a Transferable object).");

  var flavor = fromJetpackFlavor(options.datatype);

  // Ensure that the user hasn't requested a flavor that we don't support.
  if (!flavor)
    throw new Error("Getting the clipboard with the flavor '" + flavor +
                    "' is > not supported.");

  xferable.addDataFlavor(flavor);

  // Get the data into our transferable.
  clipboardService.getData(
    xferable,
    clipboardService.kGlobalClipboard
  );

  var data = {};
  var dataLen = {};
  try {
    xferable.getTransferData(flavor, data, dataLen);
  }
  catch (e) {
    // Clipboard doesn't contain data in flavor, return null.
    dd("flavor not found: "+flavor);
    return false;
  }

  // There's no data available, return.
  if (data.value === null) {
    dd("flavor not found: "+flavor);
    return false;
  }
  
  dd("flavor found: "+flavor);
  return true;
};

exports.__defineGetter__("currentFlavors", function() {
  // Loop over kAllowableFlavors, calling hasDataMatchingFlavors for each.
  // This doesn't seem like the most efficient way, but we can't get
  // confirmation for specific flavors any other way. This is supposed to be
  // an inexpensive call, so performance shouldn't be impacted (much).
  var currentFlavors = [];
  for each (var flavor in kAllowableFlavors) {
    var matches = clipboardService.hasDataMatchingFlavors(
      [flavor],
      1,
      clipboardService.kGlobalClipboard
    );
    if (matches)
      currentFlavors.push(toJetpackFlavor(flavor));
  }
  return currentFlavors;
});

// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function toJetpackFlavor(aFlavor) {
  for each (flavorMap in kFlavorMap)
    if (flavorMap.long == aFlavor)
      return flavorMap.short;
  // Return null in the case where we don't match
  return null;
}

function fromJetpackFlavor(aJetpackFlavor) {
  // TODO: Handle proper flavors better
  for each (flavorMap in kFlavorMap)
    if (flavorMap.short == aJetpackFlavor || flavorMap.long == aJetpackFlavor)
      return flavorMap.long;
  // Return null in the case where we don't match.
  return null;
}
