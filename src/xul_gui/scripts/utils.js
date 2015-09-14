
var util = {};

( function () {

  util.openFile = function (aSc, aPath, newobj_name, newobj_type, rdr_name, aOptions)
  {
    var i, val;
    var StrMgr = getService("StreamManager");
    var reader = StrMgr.createHandler(rdr_name, 0);
    reader.setPath(aPath);

    if (aOptions && "object"==typeof aOptions) {
      for (i in aOptions) {
	val = aOptions[i];
	print("set reader option: "+i+"="+val);
	reader[i] = val;
      }
    }

    aSc.startUndoTxn("Open file");
    var newobj=null;
    try {
      if (newobj_type)
	newobj = newObj(newobj_type);
      else
	newobj = reader.createDefaultObj();
      reader.attach(newobj);
      reader.read();
      reader.detach();

      newobj.name = newobj_name;
      aSc.addObject(newobj);
    }
    catch (e) {
      print("File Open Error: "+e.message);
      aSc.rollbackUndoTxn();
      return;
    }
    aSc.commitUndoTxn();

    return newobj;
  };

  util.openPDBFile = function (aSc, aPath, newobj_name, aOpts)
  {
      var mol = this.openFile(aSc, aPath, newobj_name, null, "pdb", aOpts);
    aSc.addObject(mol);
    return mol;
  };

  util.openMTZFile = function (aSc, aPath, newobj_name)
  {
    var obj = this.openFile(aSc, aPath, newobj_name, null, "mtzmap",
    {"clmn_F": "2FOFCWT", "clmn_PHI": "PH2FOFCWT",
	"gridsize": 0.25});
    aSc.addObject(obj);
    return obj;
  };

  util.makeSel = function (aSelStr, aUID)
  {
    var sel = cuemol.SelCommand();
    if (aUID) {
      if (!sel.compile(aSelStr, aUID))
	return null;
    }
    else {
      if (!sel.compile(aSelStr, 0))
	return null;
    }
    return sel;
  }

  util.createRend = function (aObj, aRendType, aRendName, aSelStr)
  {
    var rend, sce = aObj.getScene();

    var sel;
    try {
      if (aSelStr) {
	sel = this.makeSel(aSelStr, sce.uid);
      }
    }
    catch (e) {
      print("createRend selstr: error="+e);
    }

    sce.startUndoTxn("Create new representation");
    try {
      rend = aObj.createRenderer(aRendType);
      print("*** end_type: "+rend.end_captype);
      rend.name = aRendName;
      if ("sel" in rend && sel)
	rend.sel = sel;
    }
    catch (e) {
      sce.rollbackUndoTxn();
      throw e;
    }
    sce.commitUndoTxn();

    return rend;
  }

  util.centerRend = function (aRend, aView)
  {
    var pos = aRend.getCenter();
    aView.setViewCenter(pos);
  }

  util.forEachAtom = function (aMol, aSel, aFunc)
  {
    var iter = cuemol.AtomIterator();
    iter.target = aMol;
    iter.sel = aSel;
    for (iter.first(); iter.hasMore(); iter.next()) {
      var atom = iter.get();
      if (aFunc(atom))
	break;
    }
  };

} )();

var color = {};
( function () {
  color.rgb = function (aR, aG, aB)
  {
    var c = cuemol.Color();
    c.setRGB(aR, aG, aB);
    return c;
  };

  color.hsb = function (aH, aS, aB)
  {
    var c = cuemol.Color();
    c.setHSB(aH, aS, aB);
    return c;
  };
} )();

var debug = {};

( function () {

  debug.dumpObjectTree = function (o, recurse, compress, level)
  {
    var s = "";
    var pfx = "";

    if (typeof recurse == "undefined")
      recurse = 0;
    if (typeof level == "undefined")
      level = 0;
    if (typeof compress == "undefined")
      compress = true;

    for (var i = 0; i < level; i++)
      pfx += (compress) ? "| " : "|  ";

    var tee = (compress) ? "+ " : "+- ";

    for (i in o) {
      var t;
      try {
	t = typeof o[i];

	switch (t) {
	case "function":
	  var sfunc = String(o[i]).split("\n");
	  if (sfunc[2] == "    [native code]")
	    sfunc = "[native code]";
	  else
	    sfunc = sfunc.length + " lines";
	  s += pfx + tee + i + " (function) " + sfunc + "\n";
	  break;

	case "object":
	  s += pfx + tee + i + " (object) " + o[i] + "\n";
	  if (!compress)
	    s += pfx + "|\n";
	  if ((i != "parent") && (recurse))
	    s += dumpObjectTree (o[i], recurse - 1,
				 compress, level + 1);
	  break;

	case "string":
	  if (o[i].length > 200)
	    s += pfx + tee + i + " (" + t + ") " +
	      o[i].length + " chars\n";
	  else
	    s += pfx + tee + i + " (" + t + ") '" + o[i] + "'\n";
	  break;

	default:
	  s += pfx + tee + i + " (" + t + ") " + o[i] + "\n";
	}
      }
      catch (ex) {
	s += pfx + tee + i + " (exception) " + ex + "\n";
      }

      if (!compress)
	s += pfx + "|\n";

    }

    s += pfx + "*\n";

    return s;
  };
} )();
  
print("Utils loaded.");

