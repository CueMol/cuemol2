//
//
//

const {Cc,Ci} = require("chrome");
 
const dbg = require("debug_util");
const util = require("util");
const cuemol = require("cuemol");

const dd = dbg.dd;
var StrMgr = cuemol.getService("StreamManager");

exports.readSceneFile = function(sc, path, vwid, reader_name)
{
    var reader;
    if (reader_name)
	reader = StrMgr.createHandler(reader_name, 3);
    else
	reader = StrMgr.createHandler("qsc_xml", 3);

  dd("read scene: "+path);

  reader.attach(sc);
  reader.setPath(path);
  reader.read();
  reader.detach();
  var errmsg = reader.error;
  delete reader;

  //dd("********** READ_SCENE_FILE OK: "+path);
  //dd("********** SET_SCENE_NAME: "+path);
  var newname = util.getFileLeafName(path);
  //dd("********** SET_SCENE_NAME: "+newname);
  sc.setName(newname);

  // load view setting
  if (vwid) {
    try {
      sc.loadViewFromCam(vwid, "__current");
    }
    catch (e) {
      dd("ReadSceneFile> loadViewFromCam FAILED: "+e);
      // ignore error
    }
  }

  return errmsg;
};

exports.createAndReadSceneFile = function(path, reader_name)
{
  var sc = cuemol.sceMgr.createScene();
  if (!sc) {
    // window.alert("SceneOpen: create scene failed.");
    return null;
  }
  var scid = sc.uid;
      
  // create new view
  var vw = sc.createView();
  var vwid = vw.uid;
  vw.name = "0";
      
  // Load scene
  var errmsg = exports.readSceneFile(sc, path, vwid, reader_name);
      
  return [scid, vwid, errmsg];
};

exports.writeSceneFile = function(sc, path, view_id, options)
{
  // save the current view setting
  if (view_id) {
    if (!sc.saveViewToCam(view_id, "__current"))
      dd("****** saveViewToCam FAILED!!");
  }

  var writer = StrMgr.createHandler("qsc_xml", 4);
  
  dd("Write scene to: "+path);

  writer.setDefaultOpts(sc);

  // dd("QSC writer default version="+writer.version);
  // dd("QSC writer default embedAll="+writer.embedAll);
  // dd("QSC writer default base64="+writer.base64);
  // dd("QSC writer default compress="+writer.compress);
  // dd("");

  if (options && typeof options=='object') {
    if ('embedAll' in options)
      writer.embedAll = options.embedAll;
    if ('compress' in options)
      writer.compress = options.compress;
    if ('base64' in options)
      writer.base64 = options.base64;
    if ('version' in options)
      writer.version = options.version;
  }

  dd("QSC writer version="+writer.version);
  dd("QSC writer embedAll="+writer.embedAll);
  dd("QSC writer base64="+writer.base64);
  dd("QSC writer compress="+writer.compress);

  writer.attach(sc);
  writer.setPath(path);
  writer.write();
  writer.detach();
  delete writer;
  
  // writing scene results in discarding undo/redo data
  sc.clearUndoData();
  
  return;
};

exports.backupSceneFile = function(path)
{
  var file = util.createMozFile(path);
  
  if (!file.exists())
    return; // no file, no need to backup
  
  // var leafname = file.leafName;
  // var dirname = file.parent;

  // make backup file name
  var bkpath = path + ".bak";
  var bkfile = util.createMozFile(bkpath);
  var bkleafname = bkfile.leafName;
  
  dd("creating scene backup file: "+bkpath);

  if (bkfile.exists()) {
    try {
      bkfile.remove(false);
    }
    catch (e) {
      let msg = "cannot remove old backup file "+bkpath;
      dd(msg);
      throw msg;
    }
  }

  dd("file="+dbg.dumpObjectTree(file, 1));

  try {
    //file.renameTo(null, bkleafname);
    file.moveTo(null, bkleafname);
  }
  catch (e) {
    dbg.exception(e);
    let msg = "cannot create backup file "+bkpath;
    dd(msg);
    throw msg;
  }

  return;
};

