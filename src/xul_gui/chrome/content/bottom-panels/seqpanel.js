// -*-Mode: C++;-*-
//
// seqpanel.js: mol sequence bottom-panel implementation
//

if (!("seqpanel" in cuemolui)) {

  ( function () {

    var panel = cuemolui.seqpanel = new Object();

    addEventListener("load", function () { try {panel.onLoad();} catch (e) {debug.exception(e);}}, false);
    addEventListener("unload", function () {panel.onUnLoad();}, false);

    panel.mTgtSceneID = null;
    panel.mData = new Object();
    panel.mNames = new Object();

    panel.onLoad = function ()
    {
      var that = this;
      var mainWnd = this.mMainWnd = document.getElementById("main_view");

      //
      // setup tab-event handler for the MainTabView
      //
      mainWnd.mPanelContainer.addEventListener("select", function(aEvent) {
        that.detachScene(that.mTgtSceneID);
        that.attachScene(mainWnd.getCurrentSceneID());
      }, false);
      
      //////////

      this.mCanvas = document.getElementById("seq_canvas");
      this.mCanvas.addEventListener("click", function(aEvent) {
        that.onSeqClick(aEvent);
	}, false);

      this.mRulerCanvas = document.getElementById("ruler_canvas");
      //this.mNamesCanvas = document.getElementById("seq_name_canvas");
      this.mNamesList = document.getElementById("seq_name_list");

      this.mScrBox = document.getElementById("seq_scrollbox");
      this.mScrBox.addEventListener("scroll", function(aEvent) {
        that.onSeqBoxScroll(aEvent);
	}, false);

      this.setupParams();
      // this.renderRuler(300);

      this.attachScene(mainWnd.getCurrentSceneID());
    };

    panel.onUnLoad = function ()
    {
      this.detachScene(that.mTgtSceneID);
    };

    panel.attachScene = function (scid)
    {
      if (scid==null) return;

      var scene = cuemol.getScene(scid);
      if (!scene) return;

      this.mTgtSceneID = scid;
      dd("SeqPanel: change the tgt scene to "+this.mTgtSceneID);

      var that = this;
      var handler = function (args) {
	switch (args.evtType) {
	case cuemol.evtMgr.SEM_ADDED:
	dd("SeqPanel SEM_ADDED: "+args.obj.target_uid);
	that.addMolIDData(args.obj.target_uid);
	that.renderSeq();
	break;
	
	case cuemol.evtMgr.SEM_REMOVING:
	dd("SeqPanel SEM_REMOVING:"+args.obj.target_uid);
	that.removeMolData(args.obj.target_uid);
	that.renderSeq();
	break;
	
	case cuemol.evtMgr.SEM_CHANGED:
	if (args.method=="sceneAllCleared" ||
	    args.method=="sceneLoaded") {
	  dd("SeqPanel SEM_CHANGED:"+args.srcUID);
	}
	break;
	
        case cuemol.evtMgr.SEM_PROPCHG:
          if ("propname" in args.obj) {
            let pnm = args.obj.propname;
            if (pnm=="sel") {
              dd("%%% SEQP evtMgr.SEM_PROPCHG sel");
              //dd(debug.dumpObjectTree(args.obj));
              that.removeMolData(args.obj.target_uid);

              that.addMolIDData(args.obj.target_uid);
              that.renderSeq();
            }
          }
          break;
        }
      };
      
      var srctype =
      cuemol.evtMgr.SEM_SCENE|
      cuemol.evtMgr.SEM_OBJECT; // source type

      this._callbackID = cuemol.evtMgr.addListener("",
						   srctype,
						   cuemol.evtMgr.SEM_ANY, // event type
						   scene.uid, // source UID
						   handler);
      this.loadScene(scene);
      this.renderSeq();
    }

    // detach from the previous active scene
    panel.detachScene = function (oldid)
    {
      if (oldid==null || oldid<0) return;
      var oldscene = cuemol.getScene(oldid);
      if (oldscene && this._callbackID)
	cuemol.evtMgr.removeListener(this._callbackID);
      this._callbackID = null;

    };

    panel.loadScene = function (aScene)
    {
      this.mData = new Object();
      this.mNames = new Object();
      
      let uids = util.toIntArray( aScene.obj_uids );
      let that = this;
      uids.some( function (elem) {
        // dd("SeqPalen loadscene ID="+elem);
        let o = cuemol.getObject(elem);
        if (o)
          that.addMolData(o);
      });
    };

    panel.addMolIDData = function (aMolId)
    {
      var mol = cuemol.getObject(aMolId);
      if (!mol)
        return;
      this.addMolData(mol);
    }

    panel.addMolData = function (mol)
    {
      if (!cuemol.implIface2(mol, "MolCoord"))
        return;
      
      let uid = mol.uid;

      // Get chain data
      var json_str = mol.getChainsJSON();
      var data;
      try {
	// dd("MolStruct chains json: "+json_str);
	data = JSON.parse(json_str);
      }
      catch (e) {
	dd("error : "+json_str);
	debug.exception(e);
	return;
      }

      var moldata = new Object();
      var i, nlen = data.length;
      for (i=0; i<nlen; ++i) {
	var node = new Object();
	var chn = data[i];
	var chain = mol.getChain(chn);
	if (!chain) {
	  // ERROR!!
	  continue;
	}

	json_str = chain.getResidsJSON();
	var rdata;
	try {
	  rdata = JSON.parse(json_str);
	}
	catch (e) {
	  dd("error : "+json_str);
	  debug.exception(e);
	  return;
	}
	
	moldata[chn] = rdata;
      }

      this.mData[uid] = moldata;
      this.mNames[uid] = mol.name;
    };
    
    panel.removeMolData = function (aMolId)
    {
      if (this.mData[aMolId])
	delete this.mData[aMolId];
      if (this.mNames[aMolId])
	delete this.mNames[aMolId];
    };

    panel.setupParams = function ()
    {
      this.mFontSize = 14;

      this.mRulerHeight = 16;
      this.mSeqHSep = 2;
      // this.mSeqVSep = 0;

      var ctx = this.mCanvas.getContext("2d");
      ctx.font = "bold "+this.mFontSize+"px monospace";
      ctx.textBaseline = "bottom";
      var mtx = ctx.measureText("M");
      this.mTextW = mtx.width+this.mSeqHSep;
      this.mTextH = this.mFontSize;
    };

    panel.appendNameItem = function (aName)
    {
      var elem = document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "label");
      elem.setAttribute("value", aName);
      elem.setAttribute("style", "margin: 0px; border: 0px; padding: 0px;");
      this.mNamesList.appendChild(elem);
      return elem;
    };

    panel.renderSeq = function ()
    {
      var ctx = this.mCanvas.getContext("2d");

      var key, chn, nsize=0;
      var nres, res, nmax = 0;
      //var row = new Array();
      this.mRow = new Array();
      for (key in this.mData) {
	var moldata = this.mData[key];
	for (chn in moldata) {
	  var chdata = moldata[chn];
	  if (chdata) {
	    nsize++;
            this.mRow.push({mol: key, chain: chn});
	    nres = chdata.length;
	    res = chdata[nres-1].index;
	    res = parseInt(res);
	    dd("chain "+chn+", nres="+nres+", lastind="+res);
	    if (!isNaN(res) && res>nmax)
	      nmax = res;
	  }
	}
      }

      //while (this.mNamesList.getRowCount()>0)
      //this.mNamesList.removeItemAt(0);
      while (this.mNamesList.hasChildNodes())
        this.mNamesList.removeChild(this.mNamesList.firstChild);
      var name_height;
      for (var y=0; y<nsize; ++y) {
        key = this.mRow[y].mol;
	chn = this.mRow[y].chain;
        var nm = chn+":"+this.mNames[key];
        var elem = this.appendNameItem(nm);
        //dd("** Added item: "+ nm);
        //dd("elem: "+debug.dumpObjectTree(elem));
        var bo = elem.boxObject;
        //dd("**Item "+nm+", y="+debug.dumpObjectTree(bo));
        name_height = bo.height;
      }

      this.renderRuler((nmax>0)?nmax:300);

      var nx = nmax+10;
      var ny = nsize;
      var tw = this.mTextW;
      var th = name_height;
      this.mTextH = th;
      
      this.mCanvas.width = tw * nx;
      this.mCanvas.height = th * ny;
      //dd("canvas height="+h);

      ctx.font = "bold "+this.mFontSize+"px monospace";
      ctx.textBaseline = "bottom";

      //dd("********* canvas nx="+nx);
      //dd("********* canvas ny="+ny);

      for (var y=0; y<ny; ++y) {
	key = this.mRow[y].mol;
	chn = this.mRow[y].chain;
	dd("mol: "+key+", chain: "+chn);
	
	moldata = this.mData[key];
	chdata = moldata[chn];

	nres = chdata.length;
	for (var i=0; i<nres; ++i) {
	  var sg = chdata[i].single;
	  if (sg=="") sg = "*";
	  var ires = chdata[i].index;
	  ires = parseInt(ires);
	  if (isNaN(ires))
	    continue;
          var xx = ires*tw;
          var yy = y*th;
          if (chdata[i].sel) {
            let old = ctx.fillStyle;
            ctx.fillStyle = "rgb(0,255,255)";
            ctx.fillRect(xx, yy, tw, th);
            ctx.fillStyle = old;
          }
          ctx.fillText(sg, xx+(this.mSeqHSep/2.0), yy + (th+this.mFontSize)/2.0);
	}
      }
      
    };

    panel.renderRuler = function (aLen)
    {
      var ctx = this.mRulerCanvas.getContext("2d");
      var tw = this.mTextW;

      var ntics = aLen;
      
      this.mRulerCanvas.width = tw * ntics;
      // this.mRulerCanvas.width = 1000;
      this.mRulerCanvas.height = this.mRulerHeight;
      dd("Ruler width: "+this.mRulerCanvas.width);

      var i;
      var y=0;
      // dd("********** ruler ntics = "+ntics);
      ctx.beginPath();
      for (i=0; i<ntics; ++i) {
        var x = (i+0.5)*tw;
        ctx.moveTo(x, y+12);
        ctx.lineTo(x, y+16);
        // dd("tick at "+x);
      }
      ctx.stroke();

      ctx.font = "10px san-serif";
      for (i=5; i<ntics; i+=5){
        mtx = ctx.measureText(i);
        var x = (i+0.5)*tw - mtx.width/2.0;
        ctx.fillText(i, x, 0+10);
      }
    };
    

    panel.onSeqBoxScroll = function (aEvent)
    {
      var scrollx = aEvent.currentTarget.scrollLeft;
      var scrolly = aEvent.currentTarget.scrollTop;
      //dd("scroll: "+scrollx);
      this.mRulerCanvas.style.marginLeft = (-scrollx) + "px";
      //dd("marginLeft: "+this.mRulerCanvas.style.marginLeft);
      this.mNamesList.style.marginTop = (-scrolly) + "px";
    };

    panel.onSeqClick = function (aEvent)
    {
      var rect = aEvent.target.getBoundingClientRect();

      var x = aEvent.clientX - rect.left;
      var y = aEvent.clientY - rect.top;

      var ix = Math.floor( x / this.mTextW );
      var iy = Math.floor( y / this.mTextH );
      dd("seq click: "+ix+", "+iy);

      if (!this.mRow||!this.mRow[iy])
        return;
      
      var key = this.mRow[iy].mol;
      var chn = this.mRow[iy].chain;
      dd("mol ID: "+key+", chain="+chn);

      this.toggleResidSel(key, chn, ix);
    }

    panel.toggleResidSel = function (key, chn, ix)
    {
      var scene = cuemol.getScene(this.mTgtSceneID);

      if (!scene) return;
      var mol = scene.getObject(key);
      if (!mol)
        return;
      var res = mol.getResidue(chn, ix.toString());
      if (!res)
        return;

      let rrs = cuemol.createObj("ResidRangeSet");
      rrs.fromSel(mol, mol.sel);
  
      let addsel = cuemol.makeSel(chn + "." + ix + ".*");
      if (rrs.contains(res))
        rrs.remove(mol, addsel);
      else
        rrs.append(mol, addsel);
  
      let sel = rrs.toSel(mol);
      
      // EDIT TXN START //
      scene.startUndoTxn("Toggle select atom(s)");
      
      try {
        if (sel===null) {
          throw "cannot compile selstr:"+selstr;
        }
        mol.sel = sel;

        let pos = res.getPivotPos();
        view = gQm2Main.mMainWnd.currentViewW;
        if (view)
          view.setViewCenter(pos);
      }
      catch(e) {
        dd("SetSel error");
        debug.exception(e);
      }
      
      scene.commitUndoTxn();
      // EDIT TXN END //
    };

  } )();
}

