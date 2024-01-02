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

    // marker position
    panel.mMarkRow = null;
    panel.mMarkPos = null;

    // margin between seq rows (px)
    panel.mMargin = 5;

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
      /*this.mCanvas.addEventListener("click", function(aEvent) {
	  dd("click called.");
	  if (aEvent.button!=0)
	    return; // non-left click
	  that.onSeqClick(aEvent, false);
	  }, false);*/
      this.mCanvas.addEventListener("mousedown", function(aEvent) {
	  if (aEvent.button!=0)
	    return; // non-left click
	  that.onMouseDown(aEvent);
	}, false);
      this.mCanvas.addEventListener("mouseup", function(aEvent) {
	  if (aEvent.button!=0)
	    return; // non-left click
	  that.onMouseUp(aEvent);
	}, false);
      this.mCanvas.addEventListener("contextmenu", function(aEvent) {
	  that.showCtxtMenu(aEvent);
	}, false);

      this.mRulerCanvas = document.getElementById("ruler_canvas");
      //this.mNamesCanvas = document.getElementById("seq_name_canvas");
      this.mNamesList = document.getElementById("seq_name_list");

      this.mScrBox = document.getElementById("seq_scrollbox");
      this.mScrBox.addEventListener("scroll", function(aEvent) {
        that.onSeqBoxScroll(aEvent);
	}, false);

      this.mCtxtMenu = document.getElementById("seq_ctxtmenu");
      this.mCtxtMenuResLabel = document.getElementById("seq-ctm-reslabel");
      this.mCtxtMenu.addEventListener("command", function (aEvent) {
        try { that.onCtxtMenu(aEvent) } catch (e) { debug.exception(e) }
      },false);

      this.setupParams();
      // this.renderRuler(300);

      this.attachScene(mainWnd.getCurrentSceneID());
    };

    panel.onUnLoad = function ()
    {
      this.detachScene(this.mTgtSceneID);
    };

    panel.attachScene = function (scid)
    {
      if (scid==null) return;

      var scene = cuemol.getScene(scid);
      if (!scene) return;

      this.mTgtSceneID = scid;
      dd("SeqPanel: change the tgt scene to "+this.mTgtSceneID);

      var that = this;

      // setup scene event handler
      var sc_handler = function (args) {
        dd("SeqPanel> SC_HANDLER: "+args.obj.target_uid);
        switch (args.evtType) {
        case cuemol.evtMgr.SEM_CHANGED:
          if (args.method=="sceneAllCleared" ||
              args.method=="sceneLoaded") {
            dd("SeqPanel SEM_CHANGED:"+args.srcUID);
            let scene = cuemol.getScene(args.srcUID);
            that.loadScene(scene);
            that.renderSeq();
          }
          break;
        }
      };
      
      // setup object event handler
      var ob_handler = function (args) {
        dd("SeqPanel> OB_HANDLER: "+args.obj.target_uid);
        switch (args.evtType) {
        case cuemol.evtMgr.SEM_ADDED:
          dd("SeqPanel> SEM_ADDED: "+args.obj.target_uid);
          that.addMolIDData(args.obj.target_uid);
          that.renderSeq();
          break;

        case cuemol.evtMgr.SEM_REMOVING:
          dd("SeqPanel SEM_REMOVING:"+args.obj.target_uid);
          that.removeMolData(args.obj.target_uid);
          that.renderSeq();
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

        case cuemol.evtMgr.SEM_CHANGED:
          if (args.method=="topologyChanged") {
            dd("SeqPanel SEM_CHANGED:"+args.srcUID);
            let scene = cuemol.getScene(args.srcUID);
            that.loadScene(scene);
            that.renderSeq();
          }
          break;

        }
      };

      // source category type
      this._callbackID1 = cuemol.evtMgr.addListener("",
                                                   cuemol.evtMgr.SEM_SCENE,
                                                   cuemol.evtMgr.SEM_ANY, // event type
                                                   scene.uid, // source (scene) UID
                                                   sc_handler);
      //dd("seqpanel callback1 slot="+this._callbackID1);

      this._callbackID2 = cuemol.evtMgr.addListener("",
                                                   cuemol.evtMgr.SEM_OBJECT,
                                                   cuemol.evtMgr.SEM_ANY, // event type
                                                   scene.uid, // source (scene) UID
                                                   ob_handler);
      //dd("seqpanel callback2 slot="+this._callbackID2);
      this.loadScene(scene);
      this.renderSeq();
    }

    // detach from the previous active scene
    panel.detachScene = function (oldid)
    {
      if (oldid==null || oldid<0) return;
      var oldscene = cuemol.getScene(oldid);

      if (oldscene && this._callbackID1)
	cuemol.evtMgr.removeListener(this._callbackID1);
      this._callbackID1 = null;

      if (oldscene && this._callbackID2)
        cuemol.evtMgr.removeListener(this._callbackID2);
      this._callbackID1 = null;

    };

    panel.loadScene = function (aScene)
    {
      this.mData = new Object();
      this.mNames = new Object();
      
      let uids = util.toIntArray( aScene.obj_uids );
      let that = this;
      uids.some( function (elem) {
	  dd("SeqPanel load obj ID="+elem);
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
      this.mTextH = this.mFontSize + this.mMargin;
    };

    panel.appendNameItem = function (aName, aOdd)
    {
      var elem = document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "label");
      elem.setAttribute("value", aName);
      let stylestr = "flex: 1; margin: 0px; border: 0px; padding: 0px; height: "+this.mTextH+"px; ";

      if (aOdd) {
        stylestr += "background-color: buttonface; ";
      }

      elem.setAttribute("style", stylestr);
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
            if (nres==0)
              res = 0;
            else
              res = chdata[nres-1].index;
	    res = parseInt(res);
	    dd("chain "+chn+", nres="+nres+", lastind="+res);
	    if (!isNaN(res) && res>nmax)
	      nmax = res;
	  }
	}
      }

      // Remove all NamesList items
      while (this.mNamesList.hasChildNodes())
        this.mNamesList.removeChild(this.mNamesList.firstChild);

      // let name_height=0;
      // let posy = -1;
      for (var y=0; y<nsize; ++y) {
        key = this.mRow[y].mol;
	chn = this.mRow[y].chain;
        var nm = chn+":"+this.mNames[key];
        var elem = this.appendNameItem(nm, y%2);
        //dd("** Added item: "+ nm);
        //dd("elem: "+debug.dumpObjectTree(elem));

        /*
        var bo = elem.boxObject;
        //dd("**Item "+nm+", y="+debug.dumpObjectTree(bo));
        name_height = bo.height;
        if (posy>0)
          name_height = bo.screenY-posy;
        alert("name_height "+y+": "+name_height);
        posy = bo.screenY;
         */
      }

      if (nmax*this.mTextW>30000) {
        nmax = Math.floor(30000/this.mTextW);
      }
      this.renderRuler((nmax>0)?nmax:300);

      let nx = nmax+10;
      let ny = nsize;
      let tw = this.mTextW;
      let th = this.mTextH;
      //var th = name_height;
      //this.mTextH = th;
      
      this.mCanvas.width = tw * nx;
      this.mCanvas.height = th * ny;
      //dd("canvas height="+h);

      ctx.font = "bold "+this.mFontSize+"px monospace";
      ctx.textBaseline = "bottom";

      //dd("********* canvas nx="+nx);
      //dd("********* canvas ny="+ny);

      for (var y=0; y<ny; ++y) {
        let ww = nmax*tw;
        let yy = y*th;
        if (y%2) {
          let old = ctx.fillStyle;
          ctx.fillStyle = "buttonface";
          ctx.fillRect(0, yy, ww, th);
          ctx.fillStyle = old;
        }
      }

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
      
      // draw the seqpos marker
      if (this.mMarkRow!=null && this.mMarkPos!=null) {
        let x = this.mMarkPos * tw;
        let y = this.mMarkRow * th;
        let old = ctx.strokeStyle;
        ctx.strokeStyle = "rgb(255, 0, 0)";
        ctx.strokeRect(x,y,tw,th);
        ctx.strokeStyle = old;
      }

      // draw the drag tracking rect (mMarkPos - mTRPos2, mMarkRow)
      if (this.mbDrawTrackRect) {
        let ix1 = this.mMarkPos;
        let ix2 = this.mTRPos2;
        if (ix1>ix2) {
          // xchg ix1&ix2 to keep ix1<ix2
          let tmp = ix1;
          ix1 = ix2;
          ix2 = tmp;
        }
        let x = ix1 * tw;
        let w = (ix2-ix1+1) * tw;
        let y = this.mMarkRow * th;
        let old = ctx.strokeStyle;
        ctx.strokeStyle = "rgb(0, 128, 0)";
        ctx.strokeRect(x,y,w,th);
        ctx.strokeStyle = old;
      }

    };

    panel.renderRuler = function (aLen)
    {
      if (this.mRulerLen && this.mRulerLen>aLen)
        return;
      
      var ntics = this.mRulerLen = aLen;
      
      var ctx = this.mRulerCanvas.getContext("2d");
      var dpr = window.devicePixelRatio;

      var tw = this.mTextW;
      this.mRulerCanvas.width = tw * ntics;
      this.mRulerCanvas.height = this.mRulerHeight;

      /*
      var cw = this.mRulerCanvas.width;
      var ch = this.mRulerCanvas.height;
      this.mRulerCanvas.width = cw*dpr;
      this.mRulerCanvas.height = ch*dpr;
      this.mRulerCanvas.style.width = cw + 'px';
      this.mRulerCanvas.style.height = ch + 'px';
      dd("Ruler width: "+this.mRulerCanvas.width);
      dd("Ruler height: "+this.mRulerCanvas.height);
      dd("Ruler style.width: "+this.mRulerCanvas.style.width);
      dd("Ruler style.height: "+this.mRulerCanvas.style.height);
      */

      var i;
      var y=0;
      // dd("********** ruler ntics = "+ntics);
      // ctx.scale(dpr,dpr);
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
        let mtx = ctx.measureText(i);
        let x = (i+0.5)*tw - mtx.width/2.0;
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

    panel.getResidueByEvent = function (aClientX, aClientY)
    {
      var rect = this.mCanvas.getBoundingClientRect();
      var x = aClientX - rect.left;
      var y = aClientY - rect.top;
      var ix = Math.floor( x / this.mTextW );
      var iy = Math.floor( y / this.mTextH );
      //dd("seq click: "+ix+", "+iy+" btn="+aEvent.button);

      var res = this.getResidueByPos(ix, iy);
      if (res) {
        res.x = x;
        res.y = y;
      }
      return res;
    }

    panel.getResidueByPos = function (ix, iy)
    {
      if (!this.mRow||!this.mRow[iy])
        return null;
      
      var key = this.mRow[iy].mol;
      var chn = this.mRow[iy].chain;

      var scene = cuemol.getScene(this.mTgtSceneID);
      if (!scene) return null;
      var mol = scene.getObject(key);
      if (!mol) return null;
      var res = mol.getResidue(chn, ix.toString());
      if (!res) return null;

      return {"mol": mol, "chain": chn, "res": res, "ix": ix, "iy": iy};
    }

    panel.toggleResidSel = function (mol, res)
    {
      var scene = cuemol.getScene(this.mTgtSceneID);
      if (!scene) return;

      let rrs = cuemol.createObj("ResidRangeSet");
      rrs.fromSel(mol, mol.sel);
  
      let addsel = cuemol.makeSel(res.chainName + "." + res.sindex + ".*");
      if (rrs.contains(res))
        rrs.remove(mol, addsel);
      else
        rrs.append(mol, addsel);
  
      let sel = rrs.toSel(mol);
      
      cuemolui.chgMolSelObj(mol, sel, "Toggle select atom(s)", true);
      /*
      // EDIT TXN START //
      scene.startUndoTxn("Toggle select atom(s)");
      
      try {
        if (sel===null) {
          throw "cannot compile selstr:"+selstr;
        }
        mol.sel = sel;
      }
      catch(e) {
        dd("SetSel error");
        debug.exception(e);
      }
      
      scene.commitUndoTxn();
      // EDIT TXN END //
       */
    };

    panel.centerAt = function (aRes)
    {
      let pos = aRes.getPivotPos();
      view = gQm2Main.mMainWnd.currentViewW;
      if (view)
        view.setViewCenter(pos);
    };

    panel.selAround = function (aRes, aByres, aDist)
    {
      let mol = aRes.mol;
      cuemolui.molSelAround(mol, aDist, aByres);
    };

    panel.copySeq = function (aIy)
    {
      let y=aIy;

      key = this.mRow[y].mol;
      chn = this.mRow[y].chain;
      dd("copySeq> mol: "+key+", chain: "+chn);
	
      moldata = this.mData[key];
      chdata = moldata[chn];

      let str = "";
      nres = chdata.length;
      for (var i=0; i<nres; ++i) {
        var sg = chdata[i].single;
        if (sg=="") sg = "*";
        str += sg;
      }

      try {
        let clipboard = require("clipboard");
        clipboard.set(str, "text");
      }
      catch (e) {
        debug.exception(e);
        return;
      }
    };

    panel.showCtxtMenu = function (aEvent)
    {
      var scene = cuemol.getScene(this.mTgtSceneID);
      if (!scene) return;

      var x = aEvent.clientX;
      var y = aEvent.clientY;

      var r = this.getResidueByEvent(x, y);
      if (!r)
        return;
      
      var mol = r.mol;
      var res = r.res

      this.mClickX = x;
      this.mClickY = y;

      dd("SeqPanel.showCtctMenu> popup at ("+x+", "+y+")");
      var label = this.mNames[mol.uid] + " " + res.chainName + res.sindex +" "+res.name;
      this.mCtxtMenuResLabel.label = label;
      this.mCtxtMenu.openPopup(null, //this.mCanvas,
                               "overlap", x, y,
                               true, false, aEvent);
    };

    panel.onCtxtMenu = function (aEvent)
    {
      var r = this.getResidueByEvent(this.mClickX, this.mClickY);
      if (!r)
        return;

      var tgtid = aEvent.target.id;
      dd("seqpanel.onCtxtMenu ID="+tgtid);

      switch (tgtid) {
      case "seq-ctm-center": 
        this.centerAt(r.res);
        break;
      case "seq-ctm-select": 
        this.toggleResidSel(r.mol, r.res);
        break;
      case "seq-ctm-unselectall":
        cuemolui.molSelClear(r.mol);
        break;
      case "seq-ctm-invsel":
        cuemolui.molSelInvert(r.mol);
        break;

      case "seq-ctm-arbyres-3":
	this.selAround(r, true, 3);
	break;
      case "seq-ctm-arbyres-5":
	this.selAround(r, true, 5);
	break;
      case "seq-ctm-arbyres-7":
	this.selAround(r, true, 7);
	break;
      case "seq-ctm-arbyres-10":
	this.selAround(r, true, 10);
	break;

      case "seq-ctm-arnd-3":
	this.selAround(r, false, 3);
	break;
      case "seq-ctm-arnd-5":
	this.selAround(r, false, 5);
	break;
      case "seq-ctm-arnd-7":
	this.selAround(r, false, 7);
	break;
      case "seq-ctm-arnd-10":
	this.selAround(r, false, 10);
	break;

      case "seq-ctm-copyseq":
        this.copySeq(r.iy);
        break;
      }      

      // move the marker
      this.mMarkRow = r.iy;
      this.mMarkPos = r.ix;
    };

    panel.onMouseDown = function (aEvent)
    {
      aEvent.target.setCapture();
      this.mPrevRes = this.getResidueByEvent(aEvent.clientX, aEvent.clientY);
      
      var that = this;
      this.mouseMoveHandler = function(aEvent) {
        that.onMouseMoved(aEvent);
      }
      aEvent.target.addEventListener("mousemove", this.mouseMoveHandler, false);
      this.mMouseDownY = aEvent.clientY;

      if (!aEvent.shiftKey) {
        // move the marker
        this.mMarkRow = this.mPrevRes.iy;
        this.mMarkPos = this.mPrevRes.ix;
      }
      
      this.mbDrawTrackRect = true;
      this.mTRPos2 = this.mPrevRes.ix;

      this.renderSeq();

      dd("Mouse down called; prev_res="+this.mPrevRes);
    };

    panel.onMouseUp = function (aEvent)
    {
      this.mbDrawTrackRect = false;

      aEvent.target.removeEventListener("mousemove", this.mouseMoveHandler, false);

      //var res = this.getResidueByEvent(aEvent.clientX, aEvent.clientY);
      var res = this.getResidueByEvent(aEvent.clientX, this.mMouseDownY);
      dd("Mouse up called; res="+res);

      if (!this.mPrevRes || !res) {
	return;
      }

      if (this.mPrevRes.mol.uid!=res.mol.uid) {
	dd("seqpanel mouseup mol mismatch");
	return;
      }

      if (this.mPrevRes.chain!=res.chain) {
	dd("seqpanel mouseup mol chain mismatch");
	return;
      }

      if (this.mPrevRes.res.sindex==res.res.sindex) {
	dd("seqpanel mouseup res match --> click");
        if (aEvent.shiftKey) {
          dd("seqpanel SHIFT click!!!");
          if (this.mMarkPos!=null && this.mMarkRow!=null) {
            this.mPrevRes = this.getResidueByPos(this.mMarkPos, this.mMarkRow);
            dd("Res=" + debug.dumpObjectTree(res));
            dd("PrevRes=" + debug.dumpObjectTree(this.mPrevRes));
            if (this.mPrevRes.chain==res.chain) {
              // move the marker
              this.mMarkRow = res.iy;
              this.mMarkPos = res.ix;
              // range select (no toggle)
              this.rangeSelect(res, false);
            }
          }
        }
        else {
          // move the marker
          this.mMarkRow = res.iy;
          this.mMarkPos = res.ix;
          // change sel (and redraw)
          this.toggleResidSel(res.mol, res.res);
          this.centerAt(res.res);
        }
	return;
      }

      dd("seqpanel mouseup range select");
      
      // move the marker
      this.mMarkRow = res.iy;
      this.mMarkPos = res.ix;
      // change sel (toggle mode, redraw seq)
      this.rangeSelect(res, true);
    };

    panel.onMouseMoved = function (aEvent)
    {
      var res = this.getResidueByEvent(aEvent.clientX, this.mMouseDownY);
      dd("Mouse moved called. ix="+res.ix+", iy="+res.iy);

      if (this.mTRPos2==res.ix)
        return; // track rect not changed

      // update the track rect
      this.mTRPos2 = res.ix;
      this.renderSeq();
    };


    panel.rangeSelect = function (res, bToggle)
    {
      var scene = cuemol.getScene(this.mTgtSceneID);
      if (!scene) return;
      var mol = res.mol;
 
      let rrs = cuemol.createObj("ResidRangeSet");
      rrs.fromSel(mol, mol.sel);
  
      let selstr = res.res.chainName + "." +
        res.res.sindex + ":" + this.mPrevRes.res.sindex +
          ".*";
      dd("seqpanel> rangeSelect selstr="+selstr);
      let addsel = cuemol.makeSel(selstr);

      if (bToggle && rrs.contains(this.mPrevRes.res))
        rrs.remove(mol, addsel);
      else
        rrs.append(mol, addsel);
  
      let sel = rrs.toSel(mol);

      cuemolui.chgMolSelObj(mol, sel, "Toggle select atom(s)", true);
      /*
      // EDIT TXN START //
      scene.startUndoTxn("Toggle select atom(s)");
      
      try {
        if (sel===null) {
          throw "cannot compile selstr:"+selstr;
        }
        mol.sel = sel;
      }
      catch(e) {
        dd("SetSel error");
        debug.exception(e);
      }
      
      scene.commitUndoTxn();
      // EDIT TXN END //
       */
    };

  } )();
}

