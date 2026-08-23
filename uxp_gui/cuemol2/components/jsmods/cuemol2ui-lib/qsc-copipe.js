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

/////////////////////////////////////////////////////////////////
// CueMol clipboard text envelope (cross-application interchange)
//
// On macOS Gecko never exports our custom flavors: nsClipboard's
// PasteboardDictFromTransferable writes only text / RTF / HTML / images /
// files / x-moz-custom-clipdata and drops everything else, so the flavors
// below live purely in the in-process transferable cache. text/unicode IS
// exported on every platform, so mirroring the payload there is the only
// way another application -- CueMol3 -- can see a copy made here, and the
// only way we can see one made there.
//
// Format (line 1 magic, line 2 metadata, the rest base64):
//
//   CueMolClipboard/1
//   {"kind":"renderer","form":"rendArray","name":"grp1"}
//   <base64 of the raw payload bytes>
//
// Base64 because an object payload is not well-formed XML: the writer
// appends an end-of-XML sentinel plus compressed data chunks after the
// document, and that must survive as bytes.

const kEnvelopeMagic = "CueMolClipboard/1";

const AppShellService = Cc["@mozilla.org/appshell/appShellService;1"].
                        getService(Ci.nsIAppShellService);

/** base64 of a byte string (one char per byte, as convBAryToStr yields). */
function b64encode(aByteStr) {
  return AppShellService.hiddenDOMWindow.btoa(String(aByteStr));
}

/** Inverse of b64encode; throws on malformed input. */
function b64decode(aText) {
  return AppShellService.hiddenDOMWindow.atob(String(aText));
}

/**
 * Metadata a flavor maps to. `form` distinguishes the two renderer
 * payload shapes (UXP qscrend vs qscrendary), which the reader needs
 * because they deserialize through different entry points.
 */
function envelopeMetaFor(aFlavor) {
  switch (aFlavor) {
  case "application/x-cuemol2-scenexml-rend":
    return {kind: "renderer", form: "single"};
  case "application/x-cuemol2-scenexml-rend-array":
    return {kind: "renderer", form: "rendArray"};
  case "application/x-cuemol2-scenexml-obj":
    return {kind: "object", form: "single"};
  case "application/x-cuemol2-scenexml-cam":
    return {kind: "camera", form: "single"};
  case "application/x-cuemol2-scenexml-style":
    return {kind: "style", form: "single"};
  case "application/x-cuemol2-json-paint":
    return {kind: "paint", form: "single"};
  default:
    return null;
  }
}

/**
 * Build the envelope text for a payload.
 *
 * aByteStr is one JS char per payload byte: for scenexml that is what
 * convBAryToStr returns, and for the paint JSON we widen the UTF-16 text
 * to UTF-8 bytes first so the base64 is byte-defined either way.
 */
function makeEnvelope(aFlavor, aByteStr) {
  let meta = envelopeMetaFor(aFlavor);
  if (!meta) return null;
  return kEnvelopeMagic + "\n" +
         JSON.stringify(meta) + "\n" +
         b64encode(aByteStr) + "\n";
}

/** A UTF-8 unicode converter. */
function utf8Converter() {
  let conv = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
             createInstance(Ci.nsIScriptableUnicodeConverter);
  conv.charset = "UTF-8";
  return conv;
}

/** UTF-16 JS string -> a byte string holding its UTF-8 encoding. */
function toUtf8ByteStr(aStr) {
  let conv = utf8Converter();
  return conv.ConvertFromUnicode(aStr) + conv.Finish();
}

/** Inverse of toUtf8ByteStr. */
function fromUtf8ByteStr(aByteStr) {
  return utf8Converter().ConvertToUnicode(aByteStr);
}

/**
 * Parse an envelope. Returns {kind, form, bytes} or null for anything that
 * is not an intact CueMol envelope -- ordinary copied text lands here on
 * every Paste check, so this must be quiet and total.
 *
 * Everything after line 2 is the payload with all whitespace stripped, so
 * a body wrapped or CRLF-normalised on its way through the clipboard still
 * decodes.
 */
function parseEnvelope(aText) {
  if (typeof aText != "string" || aText.length == 0) return null;
  let nl1 = aText.indexOf("\n");
  if (nl1 < 0) return null;
  if (aText.substring(0, nl1).replace(/\r$/, "").trim() != kEnvelopeMagic)
    return null;
  let nl2 = aText.indexOf("\n", nl1 + 1);
  if (nl2 < 0) return null;

  let meta;
  try {
    meta = JSON.parse(aText.substring(nl1 + 1, nl2).replace(/\r$/, "").trim());
  }
  catch (e) { return null; }
  if (!meta || typeof meta.kind != "string") return null;

  let b64 = aText.substring(nl2 + 1).replace(/\s+/g, "");
  if (b64.length % 4 != 0 || !/^[A-Za-z0-9+\/]*={0,2}$/.test(b64)) return null;

  let bytes;
  try { bytes = b64decode(b64); }
  catch (e) { return null; }

  return {kind: meta.kind,
          form: (meta.form == "rendArray") ? "rendArray" : "single",
          bytes: bytes};
}

/**
 * Add the text/unicode mirror of a payload to a transferable that already
 * carries the native flavor. One setData call publishes both, so on
 * Windows / Linux nothing about the existing exchange changes and on
 * macOS the text is the only thing that actually leaves the process.
 */
function addEnvelopeFlavor(aXferable, aFlavor, aByteStr) {
  try {
    let text = makeEnvelope(aFlavor, aByteStr);
    if (!text) return;
    let str = Cc["@mozilla.org/supports-string;1"].
      createInstance(Ci.nsISupportsString);
    str.data = text;
    aXferable.addDataFlavor("text/unicode");
    aXferable.setTransferData("text/unicode", str, text.length * 2);
  }
  catch (e) {
    // The native flavor is already on the transferable; losing the mirror
    // costs cross-application paste, not this app's own copy/paste.
    dd("Copipe> envelope mirror failed: " + e);
  }
}

/** Read the envelope off the clipboard, filtered to one flavor. */
function getEnvelopeFor(aFlavor) {
  let want = envelopeMetaFor(aFlavor);
  if (!want) return null;
  let text = null;
  try { text = exports.get("text"); }
  catch (e) { return null; }
  let env = parseEnvelope(text);
  if (!env) return null;
  if (env.kind != want.kind) return null;
  // A single-renderer read must not accept an array payload (and vice
  // versa): the caller picks its deserializer by flavor.
  if (want.kind == "renderer" && env.form != want.form) return null;
  return env;
}


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

    // xmlstr is already one char per XML byte (convBAryToStr does not
    // transcode), so it goes into the envelope as-is.
    addEnvelopeFlavor(xferable, flavor, xmlstr);

    break;
  }

  case "application/x-cuemol2-json-paint": {

    // paint entry is simple json string
    var str = Cc["@mozilla.org/supports-string;1"].
      createInstance(Ci.nsISupportsString);
    str.data = options.data;
    xferable.addDataFlavor(flavor);
    xferable.setTransferData(flavor, str, options.data.length * 2);

    // Real text here, unlike the scenexml case: widen to UTF-8 bytes so
    // the envelope payload is byte-defined for both kinds.
    addEnvelopeFlavor(xferable, flavor, toUtf8ByteStr(options.data));

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
  let bHasNative = true;
  try {
    xferable.getTransferData(flavor, data, dataLen);
  }
  catch (e) {
    // Clipboard doesn't contain data in this flavor.
    bHasNative = false;
  }

  if (bHasNative && data.value === null)
    bHasNative = false;

  if (!bHasNative) {
    // Fall back to the text envelope, which is how a copy made in another
    // application (CueMol3) arrives -- and, on macOS, how a copy made here
    // arrives back, since the native flavors never reach the pasteboard.
    let env = getEnvelopeFor(flavor);
    if (!env) return null;
    if (flavor == "application/x-cuemol2-json-paint")
      return fromUtf8ByteStr(env.bytes);
    return cuemol.convPolymObj( cuemol.xpc.createBAryFromStr(env.bytes) );
  }

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
  case "application/x-cuemol2-scenexml-cam":
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
    // Not in this flavor -- the payload may still be there as the text
    // envelope. The ctxmenu Paste gate goes through here, so without this
    // fallback a pasteable payload would show a disabled menu item.
    return checkEnvelope(flavor);
  }

  // There's no data available, return.
  if (data.value === null) {
    return checkEnvelope(flavor);
  }
  
  dd("flavor found: "+flavor);
  return true;
};

/** Whether the text envelope on the clipboard matches aFlavor. */
function checkEnvelope(aFlavor) {
  let found = (getEnvelopeFor(aFlavor) !== null);
  dd((found ? "envelope found: " : "flavor not found: ") + aFlavor);
  return found;
}

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
