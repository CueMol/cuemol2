//
// Drag&Drop/Shell open routines
//

///////////////////////////////////////////////////////
// Drag and drop operations

/// find matching io handler (names) for the file name (filename) and returns the index
Qm2Main.prototype.findMatchIOHandler = function(filename, names)
{
  // TO DO: check the content of the file is actually readable

  for (let i=0; i<names.length; ++i) {
    let ext = names[i].fext;
    let c = util.splitFileName3(filename, ext);
    if (c>=0) {
      // matching handler is found
      // alert("findMatch: matched "+ext);
      return i;
    }
  }

  return -1;
};

Qm2Main.prototype.onDragOver = function (aEvent)
{
  //dd("DragOverCalled: "+aEvent.dataTransfer.types);

  //for (let i=0; i<aEvent.dataTransfer.types.length; ++i) {
  //dd("  type "+aEvent.dataTransfer.types[i]);
  //}

  let isFileDrag = aEvent.dataTransfer.types.contains("application/x-moz-file");
  if (isFileDrag) {
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }
};

Qm2Main.prototype.onDragLeave = function (aEvent)
{
  //dd("DragLeaveCalled: "+aEvent.dataTransfer.types);
};

Qm2Main.prototype.onDrop = function (aEvent)
{
  let dt = aEvent.dataTransfer;

  dd("Drop Called: "+dt.types);

  for (let i=0; i<dt.types.length; ++i) {
    dd("  type "+dt.types[i]);
  }
  let isDrag = dt.types.contains("application/x-moz-file");
  if (!isDrag)
    return;

  // dd("JSON: "+JSON.stringify(dt));
  // let data = dt.getData("application/x-moz-file");
  // dd("drag data application/x-moz-file: "+data);
  // data = dt.getData("Files");
  // dd("drag data Files: "+data);
  data = dt.getData("text/x-moz-url");
  dd("drag data url: "+data);
  
  dd("mozItemCount: "+ dt.mozItemCount);

  let names;
  try {
      // 0 is category ID for obj reader
      names = this.makeFilter(null, 0);
      for (let i=0; i<names.length; ++i) {
	  if (names[i].name=="pdb") {
	      names[i].fext += "; *.pdbqt"
	      // dd("onDrop makeFilter: "+debug.dumpObjectTree(names[i], 10));
	  }
      }
  }
  catch (e) {
    dd("Make filter is failed: "+e);
    debug.exception(e);
    return;
  }

  // append scene file (qsc) entry
  let sc_names;
  try {
    // 3 is category ID for scene reader
    sc_names = this.makeFilter(null, 3);
  }
  catch (e) {
    dd("Make filter is failed: "+e);
    debug.exception(e);
    return;
  }

  let findex;

  /*
  for (let i = 0; i < dt.mozItemCount; i++) {
    var types = dt.mozTypesAt(i);
    for (var t = 0; t < types.length; t++) {
      dd("item "+i+ ":  "+types[t]); 

      try {
	var data = dt.mozGetDataAt(types[t], i); 
	dd("(" + (typeof data) + ") : <" + data + " >");
      } catch (ex) {
	dd("<>");
	debug.exception(ex);
      }
    }
  }
*/
  
  let mozfiles = new Array();

  for (let i = 0; i < dt.mozItemCount; i++) {
    let moz_data = dt.mozGetDataAt("application/x-moz-file", i);
    //dd("mozGetData: "+ i + ", data="+moz_data);
    dd("mozGetData: ("+ i + "," + (typeof moz_data) + ") : <" + moz_data + " >");
    // alert("mozGetData: "+ i + ", data="+moz_data);
    if (moz_data instanceof Ci.nsIFile) {
      dd("  nsIFile: "+ moz_data.path);
      mozfiles.push(moz_data);
    }
  }

  for (let i = 0; i < mozfiles.length; i++) {
    let moz_data = mozfiles[i];
    if (!this.openNsFileImpl(moz_data, names, sc_names)) {
      dd("  cannot open file!!");
    }
  }

}

Qm2Main.prototype.openNsFileImpl = function (aNsFile, names, sc_names)
{
  let newobj_name = aNsFile.leafName;
  dd("  leafName: "+ newobj_name);

  // check Object readers
  findex = this.findMatchIOHandler(newobj_name, names);
  if (findex>=0) {
    let reader_name = names[findex].name;
    dd("  suggested reader name: "+ reader_name);
    this.fileOpenHelper1(aNsFile.path, newobj_name, reader_name);
    return true;
  }

  // check Scene readers
  findex = this.findMatchIOHandler(newobj_name, sc_names);
  if (findex>=0) {
    let reader_name = sc_names[findex].name;
    dd("  suggested reader name: "+ reader_name);
    this.openSceneImpl(aNsFile.path, reader_name);
    return true;
  }

  // check script handlers
  let c = util.splitFileName3(newobj_name, ".js");
  if (c>=0) {
    this.execIntJS(aNsFile.path);
    return true;
  }

  c = util.splitFileName3(newobj_name, ".py");
  if (c>=0) {
    try {
      pybr = cuemol.getService("PythonBridge");
      if (pybr) {
	let scene = this.mMainWnd.currentSceneW;
	let vwid = this.mMainWnd.getCurrentViewID();
	pybr.runFile2(aNsFile.path, scene.uid, vwid);
      }
    }
    catch (e) {}

    return true;
  }


  return false;
}

///////////////
/// convert nsICmdLine --> nsIFile array

Qm2Main.prototype.convCmdLineFiles = function (cmdLine)
{
  //////////
  // open-file argument
  var nlen = cmdLine.length;
  // alert("cmdline length="+nlen);
  var clfs = new Array();

  for (var i=0; i<nlen; ++i) {

#ifdef XP_MACOSX
    // MacOSX specific case
    if (cmdLine.getArgument(i)=="-file") {
      // next arg is file path
      ++i;
    }
    else if (cmdLine.getArgument(i)=="-url") {
      // next arg is URL
      ++i;
      try {
	var uri = cmdLine.getArgument(i);
	var nsuri = cmdLine.resolveURI(uri);
	var nsfile = nsuri.QueryInterface(Ci.nsIFileURL).file;
        // clfs.push(nsfile.path);
        clfs.push(nsfile);
      }
      catch (e) {
	debug.exception(e);
	Cu.reportError(e);
      }
      continue;
    }
#endif

    try {
      var nsfile = cmdLine.resolveFile(cmdLine.getArgument(i));
      //clfs.push(nsfile.path);
      clfs.push(nsfile);
    }
    catch (e) {
      debug.exception(e);
      Cu.reportError(e);
      window.alert("ERROR file not found: "+cmdLine.getArgument(i));
    }
  }

  return clfs;
}

///////////////
/// Request open new tab from OS/Shell

Qm2Main.prototype.openFromShell = function (cmdLine)
{
  try {
    var files = this.convCmdLineFiles(cmdLine);
    
    if (!files) {
      dd("openFromShell: cannot retrieve cmdline files");
      return;
    }

    var nlen = files.length;
    if (nlen<=0) {
      dd("openFromShell: no cmdline files");
      return;
    }
    
    let names;
    try {
      // 0 is category ID for obj reader
      names = this.makeFilter(null, 0);
    }
    catch (e) {
      dd("Make filter is failed: "+e);
      debug.exception(e);
      return;
    }
    
    // append scene file (qsc) entry
    let sc_names;
    try {
      // 3 is category ID for scene reader
      sc_names = this.makeFilter(null, 3);
    }
    catch (e) {
      dd("Make filter is failed: "+e);
      debug.exception(e);
      return;
    }

    for (i=0; i<nlen; ++i) {
      var file = files[i];
      dd("  nsIFile: "+ file.path);
      //alert("  nsIFile: "+ file.path);

      if (!this.openNsFileImpl(file, names, sc_names)) {
	dd("  cannot open file!!");
      }
    }
    
  }
  catch (e) {
    debug.exception(e);
    // alert("XXX");
    return;
  }
}

