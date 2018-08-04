//
// $Id: fileopen.js,v 1.53 2011/03/13 12:02:45 rishitani Exp $
//

Qm2Main.prototype.makeFilter = function(fp, nCatID)
{
  const pref = require("preferences-service");

  let candidates = null;
  if (arguments.length==3)
    candidates = arguments[2];

  let info = JSON.parse(this.mStrMgr.getInfoJSON2());
  let names = [];
  
  for (let i=0; i<info.length; ++i) {
    let elem = info[i];
    if (elem.category!==nCatID)
      continue;

    if (candidates &&
        !candidates.some(function (e) {return e==elem.name;}))
      continue;

    if (!pref.has("cuemol2.ui.filedlg.show_qdf_readers")) {
      // skip QDF format in the obj-reader mode (cat==0)
      if (nCatID==0 && elem.name.indexOf("qdf")==0
	  ) {
	//&& elem.name!="qdfmol") {
	dd("Skip the individual QDF format ("+elem.name+")");
	continue;
      }
    }
    
    if (fp)
      fp.appendFilter(elem.descr, elem.fext);
    dd("filter "+ elem.descr +"/"+ elem.fext);
    names.push(elem);
  }

  // fp.appendFilters(Ci.nsIFilePicker.filterAll);

  return names;
}

////////////////////////////////
// File open/save

Qm2Main.prototype.onFileOpen = function()
{
  const histry_name = "cuemol2.ui.histories.open_reader_name";
  const pref = require("preferences-service");
  
  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

  fp.init(window, "Select a File", nsIFilePicker.modeOpen);

  let names;
  try {
    // 0 is category ID for obj reader
    names = this.makeFilter(fp, 0);
  }
  catch (e) {
    dd("Make filter is failed: "+e);
    debug.exception(e);
    return;
  }

  let prev_reader_name;
  if (pref.has(histry_name))
    prev_reader_name = pref.get(histry_name);
  else
    prev_reader_name = "pdb"; // default is PDB file reader

  names.forEach( function (elem, index) {
      if (elem.name==prev_reader_name)
        fp.filterIndex = index;
    } );

  let res = fp.show();
  if (res!=nsIFilePicker.returnOK) {
      return;
  }

  let newobj_name = fp.file.leafName;
  let findex = fp.filterIndex;
  let selected_reader_name = "";

  dd("leaf_name (newobj_name): "+newobj_name);
  
  {
    selected_reader_name = names[findex].name;
    if (!selected_reader_name) {
      util.alert(window, "FileOpen: invalid filter index "+findex+" in "+reader_names);
      return;
    }
  }

  let file_ext = names[findex].fext;
  let path = fp.file.path;
  dd("findex="+findex);
  dd("Reader="+selected_reader_name);

  // save filter index
  pref.set(histry_name, selected_reader_name);

  this.fileOpenHelper1(path, newobj_name, selected_reader_name);
}

Qm2Main.prototype.fileOpenHelper1 = function(path, newobj_name, reader_name)
{
  let scene = this.mMainWnd.currentSceneW;
  if (!scene) {
    util.alert(window, "FileOpen: get current scene Failed.");
    return;
  }

  ///////////////////////////////
  // Make file reader obj (required for some option handlings)
  //
  let reader = this.mStrMgr.createHandler(reader_name, 0);
  reader.setPath(path);
  let gzpos = path.lastIndexOf(".gz");
  if (gzpos==path.length-3)
    reader.compress = "gzip";


  dd("Selected reader name: "+reader_name);

  let obj_type;
  let rend_types;
  {
    let tmpobj = reader.createDefaultObj();
    obj_type = tmpobj._wrapped.getClassName();
    rend_types = tmpobj.searchCompatibleRendererNames();
    tmpobj = null;
  }

  //////////////////////////////
  // show the setup-rend dialog
  //
  let dlgdata = new Object();
  dlgdata.sceneID = scene.uid;
  dlgdata.ok = false;
  dlgdata.bEditObjName = true;
  dlgdata.target = new Array();
  dlgdata.target[0] = new Object();
  dlgdata.target[0].name = newobj_name;
  dlgdata.target[0].obj_type = obj_type;
  dlgdata.target[0].rend_types = rend_types;
  dlgdata.target[0].reader_name = reader_name;
  dlgdata.target[0].reader = reader;
  dlgdata.target[0].path = path;

  dlgdata.target[0].preset_types
  = this.getCompatibleRendPresetNames(obj_type, dlgdata.sceneID);

  window.openDialog("chrome://cuemol2/content/fopen-option-dlg.xul",
                    "Setup renderer",
                    "chrome,modal,resizable=yes,dependent,centerscreen",
                    dlgdata);

  delete dlgdata.target[0].reader;

  if (!dlgdata.ok) {
    dd("option dialog canceled");
    dlgdata = null;
    return;
  }
  
  //////////////////////
  // Do the actual tasks

  // EDIT TXN START //
  scene.startUndoTxn("Open file");
  try {
    let newobj = reader.createDefaultObj();
    reader.attach(newobj);
    //reader.base64 = true;
    reader.read();
    reader.detach();

    newobj.name = dlgdata.target[0].name;
    scene.addObject(newobj);

    dlgdata.obj_id = newobj.uid;
    dlgdata.new_obj = true;
    this.doSetupRend(scene, dlgdata);
  }
  catch (e) {
    dd("File Open Error: "+e);
    debug.exception(e);
    
    util.alert(window, "Failed to open file: "+path);
    reader = null;
    scene.rollbackUndoTxn();
    dlgdata = null;
    return;
  }

  reader = null;

  scene.commitUndoTxn();
  // EDIT TXN END //

  // save to MRU list
  try {
    const mru = require("mru-files");
    mru.addMRU(path, reader_name);
    //mru.dumpMRU();
  }
  catch (e) {
    dd("MRU Error: "+e);
    debug.exception(e);
  }

  dlgdata = null;

  // show the completion message
  let msg = "File: ["+path+"] is loaded.";
  gQm2Main.mStatusLabel.label = msg;
  cuemol.putLogMsg(msg);
};

Qm2Main.prototype.onSaveAsObj = function(targetID)
{
  var targetObj = targetObj = cuemol.getObject(targetID);
  dd("target obj: "+targetObj);
  if (typeof targetObj=='undefined' || targetObj==null)
    return;

  const nsIFilePicker = Components.interfaces.nsIFilePicker;
  let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, "Save Object As", nsIFilePicker.modeSave);

  let names;
  try {
    // 1 is category ID for obj writer
    let candidates = this.mStrMgr.findCompatibleWriterNamesForObj(targetObj.uid);
    candidates = candidates.split(",");
    dd("Write filter candidates: "+candidates);
    names = this.makeFilter(fp, 1, candidates);
  }
  catch (e) {
    dd("Make filter is failed: "+e);
    debug.exception(e);
    return;
  }

  // determine initial path and file name
  let obj_src;
  obj_src = targetObj.src;
  dd("object.src: "+obj_src);
  if (!obj_src) {
    // no src prop --> use obj name as default file name
    fp.defaultString = targetObj.name;
    fp.defaultExtension = names[0].fext;
  }
  else {
    try {
      let init_file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      init_file.initWithPath(obj_src);
      fp.defaultString = "copy_of_"+init_file.leafName;
      fp.displayDirectory = init_file.parent;
    }
    catch (e) {
      debug.exception(e);
      dd("Cannot determine default file name, src="+obj_src);
    }
  }
  
  /////////////////////
  // setup default file name/extension

  const histry_name = "cuemol2.ui.histories.save_writer_name";
  const pref = require("preferences-service");

  let prev_writer_name = "pdb";
  if (pref.has(histry_name)) {
    prev_writer_name = pref.get(histry_name);
  }
  
  names.forEach( function (elem, index) {
    if (elem.name==prev_writer_name)
      fp.filterIndex = index;
  } );

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel)
    return;

  let writer_name = names[fp.filterIndex].name;
  let path = fp.file.path;
  dd("Selected writer name: "+writer_name);
  dd("path: "+path);
  let writer = this.mStrMgr.createHandler(writer_name, 1);
  writer.setPath(path);
  dd("Created writer: "+writer._wrapped.getClassName());

  // // EDIT TXN START //
  // scene.startUndoTxn("Save As (conv to link)");

  let bOK = false;
  try {
    // writer.base64 = true;
    // writer.compress = "gzip";
    writer.convToLink = true;
    writer.attach(targetObj);
    writer.write();
    writer.detach();
    bOK = true;
  }
  catch (e) {
    dd("File Save Error: "+e);
    debug.exception(e);
  }

  if (!bOK) {
    util.alert(window, "Failed to save file: "+path);
    return;
  }
    
  // scene.commitUndoTxn();
  // // EDIT TXN END //

  // save filter index
  pref.set(histry_name, writer_name);

  writer = null;
  targetObj = null;

  // show the completion message
  let msg = "File: ["+path+"] is saved.";
  gQm2Main.mStatusLabel.label = msg;
  cuemol.putLogMsg(msg);

};

Qm2Main.prototype.onFileSaveAs = function()
{
  let targetID;
  let that = this;
  let scene = this.mMainWnd.currentSceneW;
  
  targetID = util.doSelectObjPrompt(window, scene,
				    "Select object to save",
				    function (type, elem) {
    if (type!="object") return null;
    let rdrnames = that.mStrMgr.findCompatibleWriterNamesForObj(elem.ID);
    if (rdrnames.length==0)
      return null;
    return elem.name + " (" + elem.type + ", id="+elem.ID+")";
  });

  if (targetID===null) {
    util.alert(window, "No object to save");
    return null;
  }

  return this.onSaveAsObj(targetID);
}

///////////////////////////////////////////////////////
// Scene file I/O

Qm2Main.prototype.openSceneImpl = function(path, reader_name)
{
  let scene = this.mMainWnd.currentSceneW;
  let qsc_io = require("qsc-io");
  
  let vwid = this.mMainWnd.getCurrentViewID();
  let errmsg = "";

  if (scene && scene.isJustCreated()) {
    // scene is just created and empty, so we read into it without adding new tab
    try {
	errmsg = qsc_io.readSceneFile(scene, path, vwid, reader_name);
    }
    catch (e) {
      debug.exception(e);
      util.alert(window, "Read scene from \""+path+"\" was failed.\nReason: "+cuemol.getErrMsg());
      // scene.clearAllData();
      return false;
    }
    if (errmsg) {
      util.alert(window, "Read scene from \""+path+"\" was failed.\nReason: (see log window)");
      return false;
    }
    // return;
  }
  else {
    // Read into a new scene and view
    let result;
    try {
	result = qsc_io.createAndReadSceneFile(path, reader_name);
      errmsg = result[2];
    }
    catch (e) {
      debug.exception(e);
      util.alert(window, "Read scene from \""+path+"\" was failed.\nReason: "+cuemol.getErrMsg());
      return false;
    }
    if (errmsg) {
      util.alert(window, "Read scene from \""+path+"\" was failed.\nReason: (see log window)");
      return false;
    }

    this.mMainWnd.addMolViewTab(result[0], result[1]);
  }

  const mru = require("mru-files");
  //mru.addMRU(path, "qsc_xml");
  dd("@@@ reader_name="+reader_name);
  mru.addMRU(path, reader_name);
  //mru.dumpMRU();

  // show the completion message
  let msg = "Scene file: ["+path+"] is loaded.";
  gQm2Main.mStatusLabel.label = msg;
  cuemol.putLogMsg(msg);

  return true;
}

Qm2Main.prototype.onOpenScene = function()
{
  const hisname = "cuemol2.ui.histories.open_scene_name";
  const pref = require("preferences-service");

  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

  fp.init(window, "Open Scene", nsIFilePicker.modeOpen);

  var names;
  try {
    // 3 is category ID for scene reader
    names = this.makeFilter(fp, 3);
  }
  catch (e) {
    dd("Make filter is failed: "+e);
    return;
  }

  // Preselect the previous (or default) reader
  let prev_reader_name;
  if (pref.has(hisname))
    prev_reader_name = pref.get(hisname);
  else
    prev_reader_name = "qsc"; // default is QSC file reader

  names.forEach( function (elem, index) {
    if (elem.name==prev_reader_name)
      fp.filterIndex = index;
  } );

  let res=fp.show();
  if (res!=nsIFilePicker.returnOK) {
      return;
  }

  let findex = fp.filterIndex;
  let reader_name = names[findex].name;

  // save filter index
  pref.set(hisname, reader_name);

  this.openSceneImpl(fp.file.path, reader_name);
}

Qm2Main.prototype.onReloadScene = function()
{
  let sc = this.mMainWnd.currentSceneW;
  if (!sc) {
    util.alert(window, "Reload scene: get current scene failed.");
    return;
  }
  let vwid = this.mMainWnd.getCurrentViewID();

  let path = sc.src;
  // let rdrnm = sc.srctype;
  if (!path || !util.isFile(path)) {
    dd("Reload of unsaved scene is requested (ignored).");
    return;
  }

  if (sc.modified) {
    let scene_name = sc.name;
    if (!scene_name) scene_name = "";
    let result = this.mPrompts.confirm(window, document.title,
                                       "Do you want to reload the scene :"+scene_name+" ?");
    if (!result) return;
  }

  sc.clearAllData();

  let qsc_io = require("qsc-io");
  try {
    qsc_io.readSceneFile(sc, path, vwid);
  }
  catch (e) {
    util.alert(window, "Read scene failed: "+e);
    sc.clearAllData();
    return;
  }

  // show the completion message
  let msg = "Scene file: ["+path+"] is reloaded.";
  gQm2Main.mStatusLabel.label = msg;
  cuemol.putLogMsg(msg);
}

Qm2Main.prototype.onSaveSceneAs = function ()
{
  let vwid = this.mMainWnd.getCurrentViewID();
  let sc = this.mMainWnd.currentSceneW;
  if (!sc) {
    util.alert(window, "Save: get current scene Failed.");
    return false;
  }

  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

  let names;
  try {
    // 4 is category ID for scene writer
    names = this.makeFilter(fp, 4);
  }
  catch (e) {
    dd("Make filter is failed: "+e);
    return false;
  }

  // set default name as the scene name (and the first file type)
  fp.defaultString = sc.name;
  fp.defaultExtension = names[0].fext;

  fp.init(window, "Save Scene As", nsIFilePicker.modeSave);

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel) {
    //window.alert("Save: canceled.");
    return false;
  }

  let writer_name = names[fp.filterIndex].name;
  if (fp.filterIndex<0)
    writer_name = names[0].name;

  // Add extension to the file name, if there isn't.
  let path = fp.file.path;
  res = util.splitFileName2(path, names[fp.filterIndex].fext);
  if (res) {
    path = res.path;
  }

  //////////////////////////////
  // perform the setup-qsc dialog
  let dlgdata = new Object();
  dlgdata.ok = false;

  window.openDialog("chrome://cuemol2/content/qscwriter-option-dlg.xul",
                    "QSC file options",
                    "chrome,modal,resizable=no,dependent,centerscreen",
                    dlgdata);

  if (!dlgdata.ok) {
    dd("option dialog canceled");
    dlgdata = null;
    return false;
  }

  let qsc_io = require("qsc-io");
  try {
    qsc_io.writeSceneFile(sc, path, vwid, dlgdata);
  }
  catch (e) {
    util.alert(window, "ERROR, Write scene failed: "+e);
    return false;
  }

  // saved successfully
  sc.setName(util.getFileLeafName(path));

  // save to MRU list
  const mru = require("mru-files");
  mru.addMRU(path, "qsc_xml");
  //mru.dumpMRU();

  // show the completion message
  let msg = "Scene file: ["+path+"] is saved.";
  gQm2Main.mStatusLabel.label = msg;
  cuemol.putLogMsg(msg);

  return true;
}

Qm2Main.prototype.onSaveScene = function ()
{
  let sc = this.mMainWnd.currentSceneW;
  if (!sc) {
    util.alert(window, "Save: get current scene Failed.");
    return false;
  }

  let path = sc.src;
  // let wtrnm = sc.srctype;

  if (!path || !util.isFile(path))
    return this.onSaveSceneAs();

  let qsc_io = require("qsc-io");
  try {
    qsc_io.backupSceneFile(path);
  }
  catch (e) {
    cuemol.putLogMsg("WARNING: Cannot create backup file, "+e);
  }

  let vwid = this.mMainWnd.getCurrentViewID();
  try {
    qsc_io.writeSceneFile(sc, path, vwid);
  }
  catch (e) {
    util.alert(window, "ERROR, Write scene failed: "+e);
    return false;
  }
  
  // show the completion message
  let msg = "Scene file: ["+path+"] is saved.";
  gQm2Main.mStatusLabel.label = msg;
  cuemol.putLogMsg(msg);

  // saved successfully
  return true;
}

////////////////////////////////////////////////////
// Camera/View file I/O

Qm2Main.prototype.onSaveCurView = function ()
{
  let scene = this.mMainWnd.currentSceneW;
  if (!scene) {
    util.alert(window, "Save: get current scene Failed.");
    return;
  }

  let vwid = this.mMainWnd.getCurrentViewID();
  
  if (!scene.saveViewToCam(vwid, "__current")) {
    util.alert(window, "Save camera failed!");
    return;
  }

  this.onSaveCamera("__current");
}

Qm2Main.prototype.onSaveCamera = function (aName)
{
  let scene = this.mMainWnd.currentSceneW;
  if (!scene) {
    util.alert(window, "Save: get current scene Failed.");
    return false;
  }

  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.appendFilter("Camera setting (*.cam)", "*.cam");

  if (aName!="__current") {
    fp.defaultString = aName;
    fp.defaultExtension = "*.cam";
  }
  
  fp.init(window, "Save camera to file", nsIFilePicker.modeSave);

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel)
    return false;

  let path = fp.file.path;
  res = util.splitFileName2(path, "*.cam");
  if (res) {
    path = res.path;
  }

  res = false;
  if (aName=="__current") {
    res = scene.saveCameraTo(aName, path);
  }
  else {
    // EDIT TXN START //
    scene.startUndoTxn("Change camera link "+name);
    try {
      res = scene.saveCameraTo(aName, path);
    }
    catch (e) {
      dd("***** ERROR: Change camera link "+e);
      debug.exception(e);
      scene.rollBackUndoTxn();
      return false;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //
  }

  // save the current view setting
  if (!res) {
    util.alert(window, "Save camera failed!");
    return false;
  }

  return true;
};

Qm2Main.prototype.onLoadCamera = function ()
{
  let scene = this.mMainWnd.currentSceneW;
  if (!scene) {
    util.alert(window, "Load camera: get current scene Failed.");
    return null;
  }

  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.appendFilter("Camera setting (*.cam)", "*.cam");

  fp.init(window, "Open camera file", nsIFilePicker.modeOpen);

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel)
    return null;

  let path = fp.file.path;
  res = util.splitFileName2(path, "*.cam");
  if (res) {
    path = res.path;
  }

  try {
    return scene.loadCamera(path);
  }
  catch (e) {
    util.alert(window, "Load camera failed!");
    return null;
  }
}

///////////////////////////////////////////////////////
// Rendering file export

Qm2Main.prototype.exportScene = function()
{
  let view = this.mMainWnd.currentViewW;
  let sc = this.mMainWnd.currentSceneW;
  if (typeof sc==="undefined" || sc===null) {
    util.alert(window, "Save: get current scene Failed.");
    return;
  }

  /////////////////////
  // make file picker dialog obj

  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  let names;

  try {
    // 2 is category ID for scene exporters
    names = this.makeFilter(fp, 2);

    // add LWO writer
    let elem = {name: "qslwrite", fext: "*.qsl", descr: "CueMol light-weight scene (*.qsl)"}
    fp.appendFilter(elem.descr, elem.fext);
    names.push(elem);
  }
  catch (e) {
    dd("Make filter is failed");
    debug.exception(e);
    return;
  }

  /////////////////////
  // setup default file name/extension

  const histry_name = "cuemol2.ui.histories.export_scene_name";
  const pref = require("preferences-service");

  let prev_reader_name = null;
  if (pref.has(histry_name))
    prev_reader_name = pref.get(histry_name);

  names.forEach( function (elem, index) {
      if (elem.name==prev_reader_name)
        fp.filterIndex = index;
    } );

  {
    // set default name as the scene name
    let ext = names[fp.filterIndex].fext;
    fp.defaultExtension = ext;
    let naster = ext.indexOf("*");
    fp.defaultString = util.removeFileExt( sc.name ) + ext.substr(naster+1);
    dd("scene name="+sc.name);
    dd("ext ="+ext);
  }

  fp.init(window, "Select a file to export", nsIFilePicker.modeSave);

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel) {
    //window.alert("Save: canceled.");
    return;
  }

  let fext = names[fp.filterIndex].fext;

  let path = fp.file.path;
  let extpos = util.splitFileName(path, fext);
  if (extpos<0) {
    // no extension str
    let extpos2 = fext.lastIndexOf(".");
    path = path + fext.substr(extpos2);
    extpos = util.splitFileName(path, fext);
  }

  // save the current view setting
  if (!sc.saveViewToCam(view.uid, "__current")) {
    dd("****** saveViewToCam FAILED!!");
  }

  // check the case of lw scene writer
  if (names[fp.filterIndex].name=="qslwrite") {
    this.writeLwScene(sc, view, path);
    // save the selected filter name
    pref.set(histry_name, "qslwrite");
    return;
  }

  let exporter = this.mStrMgr.createHandler(names[fp.filterIndex].name,
                                            names[fp.filterIndex].category);
  if (typeof exporter==="undefined" || exporter===null) {
    util.alert(window, "Save: get exporter Failed.");
    return;
  }

  ////////////////////////////////////
  // Do filetype specific actions
  
  exporter.width = view.width;
  exporter.height = view.height;

  if (exporter.name == "png") {
    // show PNG option dialog
    let dlgdata = new Object();
    dlgdata.exporter = exporter;
    dlgdata.path = path;
    dlgdata.ok = false;
    dlgdata.width = view.width;
    dlgdata.height = view.height;

    window.openDialog("chrome://cuemol2/content/exportpng-opt-dlg.xul",
                      "PNG options",
                      "chrome,modal,resizable=yes,dependent,centerscreen",
                      dlgdata);
    if (!dlgdata.ok) {
      dd("option dialog canceled");
      dlgdata = null;
      exporter = null;
      return;
    }
  }
  else if (exporter.name == "luxrend" ||
	exporter.name == "luxcore") {
    // show LuxRender option dialog
    let dlgdata = new Object();
    dlgdata.exporter = exporter;
    dlgdata.path = path;
    dlgdata.ok = false;
    dlgdata.width = view.width;
    dlgdata.height = view.height;

    window.openDialog("chrome://cuemol2/content/exportlxs-opt-dlg.xul",
		      "LuxRender options",
                      "chrome,modal,resizable=yes,dependent,centerscreen",
                      dlgdata);
    if (!dlgdata.ok) {
      dd("option dialog canceled");
      dlgdata = null;
      exporter = null;
      return;
    }
  }
  else if (exporter.name == "pov") {
    // POV specific case
    let incfile = path.substr(0, extpos) + ".inc";
    exporter.setSubPath("inc", incfile);
    dd("write inc: "+incfile);
  }
  else if (exporter.name == "wbp") {
    // WBP specific case
    let incfile = path.substr(0, extpos) + ".mqo";
    exporter.setSubPath("mqo", incfile);
    dd("write mqo: "+incfile);
  }

  try {
    dd("write: "+path);

    // use camera of the current view (TO DO: configurable)
    exporter.camera = "__current";

    exporter.attach(sc);
    exporter.setPath(path);
    exporter.write();
    exporter.detach();
  }
  catch (e) {
  }

  // save the selected filter name
  pref.set(histry_name, exporter.name);

  // exporter is expected to be removed by GC...
  exporter = null;
};

///////////////////////////////////////////////////////////////////////////
// ???

Qm2Main.prototype.deleteObject = function (aObjID)
{
  let obj = cuemol.getObject(aObjID);
  if (!obj)
    throw ("DeleteObject: ERROR!! invalid object ID="+aObjID);

  let sc = obj.getScene();
  if (!sc)
    throw ("DeleteObject: ERROR!! invalid object ID="+aObjID);
  
  var name = "";
  try { name = obj.name; } catch (e) {}

  // EDIT TXN START //
  sc.startUndoTxn("Destroy object "+name);

  try {
    sc.destroyObject(aObjID);
  }
  catch (e) {
    debug.exception(e);
    sc.rollbackUndoTxn();
    util.alert(window, "Fatal error: Cannot destroy object.");
    return;
  }

  sc.commitUndoTxn();
  // EDIT TXN END //

  return;
}

/////////////////////////////////////////////////////////////
// experimental routines

Qm2Main.prototype.onExecScr = function ()
{
  let scene = this.mMainWnd.currentSceneW;
  if (!scene) {
    util.alert(window, "Save: get current scene Failed.");
    return;
  }

  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  let ftype = new Array();

  var pybr;
  if (cuemol.hasClass("PythonBridge")) {
    try {
      pybr = cuemol.getService("PythonBridge");
      if (pybr) {
	fp.appendFilter("Python (*.py)", "*.py");
	ftype.push("py");
      }
    }
    catch (e) {}
  }
  
  /*
  if (typeof scene.execJSFile === 'function') {
    fp.appendFilter("Javascript (*.js)", "*.js");
    ftype.push("js");
  }
  */
  
  fp.appendFilter("Internal Javascript (*.js)", "*.js");
  ftype.push("intjs");

  fp.init(window, "Select a File", nsIFilePicker.modeOpen);

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel)
    return;

  if (ftype[fp.filterIndex]=="py") {
    this.execPython(fp.file.path);
  }
  else if (ftype[fp.filterIndex]=="js") {
    scene.execJSFile(fp.file.path);
  }
  else if (ftype[fp.filterIndex]=="intjs") {
    this.execIntJS(fp.file.path);
  }

};

Qm2Main.prototype.execPython = function (path)
{
  pybr = cuemol.getService("PythonBridge");

  try {
    pybr.runFile(path);
  }
  catch (e) {
    cuemol.putLogMsg("Python script error:\n"+e.message);
  }
  
  // Add to MRU
  const mru = require("mru-files");
  mru.addMRU(path, "scr-python");
};

Qm2Main.prototype.execIntJS = function (path)
{
  var file = Cc["@mozilla.org/file/local;1"]
    .createInstance(Ci.nsILocalFile);
  file.initWithPath(path);

  var data = "";
  var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
    .createInstance(Ci.nsIFileInputStream);
  var sstream = Cc["@mozilla.org/scriptableinputstream;1"]
    .createInstance(Ci.nsIScriptableInputStream);
  fstream.init(file, -1, 0, 0);
  sstream.init(fstream); 

  var str = sstream.read(4096);
  while (str.length > 0) {
    data += str;
    str = sstream.read(4096);
  }
  
  sstream.close();
  fstream.close();  

  dd("read file: "+data);

  var scene = this.mMainWnd.currentSceneW;
  var view = this.mMainWnd.currentViewW;
  try {
    let fun = new Function("scene", "view", "println", data);
    fun(scene, view, function(aStr) {cuemol.putLogMsg(aStr);} );
  }
  catch (e) {
    cuemol.putLogMsg("Exec internal JS error:\n"+e.message);
    // return;
  }
  
  cuemol.putLogMsg("Exec internal JS: "+path+" done.");

  // Add to MRU
  const mru = require("mru-files");
  mru.addMRU(path, "scr-intjs");
}

Qm2Main.prototype.onOpenURL = function (aURL)
{
  var stylestr = "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar,dependent,centerscreen";
  var url = "chrome://cuemol2/content/tools/mybrowser.xul";
  if (aURL)
    url = aURL;
  var win = this.mWinMed.getMostRecentWindow("CueMol2:WebBrowser");
  if (win)
    win.focus();
  else
    window.openDialog(url, "", stylestr);
};

