//
// multigrad_editor.js
//   Multi-gradient editor dialog implementation
//

if (!("MultiGradEditor" in cuemolui)) {
  cuemolui.MultiGradEditor = ( function () {

    /// Constructor
    var ctor = function ()
    {
      let that = this;

      // get arguments (scene id)
      var args = this.mArgs = window.arguments[0]; //.QueryInterface(Ci.xpcIJSWeakReference).get(); 
      this.mSceneID = args.scene_id;
      this.mRendID = args.rend_id;

      this.mTreeView = new cuemolui.TreeView(window, "paint-listbox");
      this.mTreeView.clickHandler = function (ev, row, col) {
	that.onItemClick(ev, row, col);
      }
      //this.mTreeView.defCtxtMenuId = "paintPanelCtxtMenu";

      // dummy serial number to invalidate the CSS color (for paint listbox)
      this.mSerial = 0;

      // Set onload handler
      //  (This should be the last so that onLoad called after the init of tree view!)
      addEventListener("load", function() {
	try { that.onLoad(); } catch (e) { debug.exception(e); }
      }, false);

      this.mOrigGrad = null;

      dd("MultiGradEditor> taget scene UID="+this.mSceneID);
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      let that = this;

      let rend = cuemol.getRenderer(this.mRendID);
      if (!'colormode' in rend || rend.colormode!="multigrad") {
	// ERROR!!
	return;
      }

      this.mParBox = document.getElementById("edit-param");
      this.mParBox.addEventListener("change",
				    function(e) { that.onParChanged(e); },
				    false);

      this.mColBox = document.getElementById("edit-color");
      this.mColBox.addEventListener("change",
				    function(e) { that.onColChanged(e); },
				    false);

      this.mAddBtn = document.getElementById("add-btn");
      this.mDelBtn = document.getElementById("del-btn");
      this.mKRBtn = document.getElementById("keepratio-btn");

      // color_mapname

      // multi_grad
      this.setupListBox(rend);
      //this.setupPreview(rend);
      this.setupPreview(this.mTreeView.getData());

      // this.setupHistogram();
    };

    klass.setupListBox = function (aRend)
    {
      let coloring = aRend.multi_grad;

      let i, col, par, nlen = coloring.size;
      let nodes = new Array();
      
      for (i=0; i<nlen; ++i) {
	par = coloring.getValueAt(i);
	col = coloring.getColorAt(i);

        dd("par="+par+", col="+col);
        var node = new Object();
	//node.obj_id = i;
	//node.name = par.toString();
	node.name = par.toFixed(2);
	node.values = {
	  'par_value' : par,
	  'color_value': col.toString(),
	  'html_colstr': util.getHTMLColor(col)
	  };

	//var propval = "col_"+this._serial+"_"+i;
	//node.props = { color_value: propval };
	//this.setPaintColCSS(propval, col);

	nodes.push(node);
      }
      
      this.sortNodes(nodes);
      this.updateMinMax(nodes);

      //++this.serial;
      this.realizeNodeColors( nodes );

      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();

    };
    
    klass.realizeNodeColors = function (aNodes)
    {
      // remove existing rules
      this._removeColCSS();
      
      let node, propval;
      const nsize = aNodes.length;
      for (let i=0; i<nsize; ++i) {
	node = aNodes[i];
	node.obj_id = i;
	propval = "col_"+this.mSerial+"_"+i;
	node.props = { color_value: propval };
	this._setColCSS(node);
      }
      ++this.mSerial;
    };

    klass._removeColCSS = function ()
    {
      var i, nlen = document.styleSheets.length;
      for (i=0; i<nlen; ++i) {
	var ss = document.styleSheets[i];
	for (var j=ss.cssRules.length-1; j>=0; --j) {
	  var sr = ss.cssRules[j];
	  if ('selectorText' in sr &&
	      sr.selectorText.indexOf("#paint-listbox-children::-moz-tree-cellcol")==0) {
	    ss.deleteRule(j);
	  }
	}
      }
    };

    klass._setColCSS = function (aNode)
    {
      var ss = document.styleSheets[document.styleSheets.length-1];
      var propnm = aNode.props.color_value;
      var insid = ss.insertRule("#paint-listbox-children::-moz-tree-cell("+propnm+") {}",
				ss.cssRules.length);
      var sr = ss.cssRules[insid];
      sr.style.backgroundColor = aNode.values.html_colstr;
      dd("setColCSS> name="+aNode.name+" col="+aNode.values.html_colstr);
    };

    klass.updateMinMax = function (aNodes)
    {
      let nlen = aNodes.length;
      let i;
      let min_par = 1e+10;
      let max_par = -1e+10;
      for (i=0; i<nlen ;++i) {
	let par = aNodes[i].values.par_value;
	if (par<min_par) min_par = par;
	if (par>max_par) max_par = par;
      }

      let bChg = false;
      if (this.mMinPar != min_par) {
	bChg = true;
	this.mMinPar = min_par;
      }
      if (this.mMaxPar != max_par) {
	bChg = true;
	this.mMaxPar = max_par;
      }

      if (bChg)
	this.setupHistogram();
    };

    klass.sortNodes = function (aNodes)
    {
      aNodes.sort( function (a, b) {
	return a.values.par_value - b.values.par_value;
      });
    };

    klass.setupPreview = function (aNodes)
    {
      let i, col, sel;
      let nlen = aNodes.length;

      let min_lab = document.getElementById("min_value");
      let max_lab = document.getElementById("max_value");

      let grad_elem = document.getElementById("preview_grad");

      // remove all gradient stops
      while (grad_elem.firstChild)
	grad_elem.removeChild(grad_elem.firstChild);
      
      //let dmin = obj.den_min;
      //let dmax = obj.den_max;

      let dmin = this.mMinPar;
      let dmax = this.mMaxPar;

      if (nlen>0) {
	min_lab.value = dmin.toFixed(2);
	max_lab.value = dmax.toFixed(2);
      }
      else {
	min_lab.value = "No gradient nodes";
	max_lab.value = "";
	return;
      }

      for (i=0; i<nlen; ++i) {
	let elem = aNodes[i];
	let val = elem.values.par_value; //coloring.getValueAt(i);
	//let col = coloring.getColorAt(i);

	dd("par="+val+", col="+elem.values.html_colstr);
	let rho = (val-dmin)/(dmax-dmin);

	//let strcol = "rgb("+col.r()+","+col.g()+","+col.b()+")";

	let stop_elem = document.createElementNS("http://www.w3.org/2000/svg", "stop");
	stop_elem.setAttribute("offset", rho);
	stop_elem.setAttribute("stop-color", elem.values.html_colstr);
	grad_elem.appendChild(stop_elem);
      }
      
    };

    klass.setupHistogram = function ()
    {
      let rend = cuemol.getRenderer(this.mRendID);
      let obj = rend.getColorMapObj();

      if (!'getHistogramJSON' in obj) {
	// no histogram data --> do not show the graph
	let box = document.getElementById("histo_box");
	box.setAttribute("collapsed", "true");
	return;
      }

      let scl = 2;

      let canvas = document.getElementById("histo_canvas");
      dd("canvas.width = "+canvas.width);
      let ctx = canvas.getContext("2d");
      canvas.height = 32;

      //return;
      let nbin = canvas.width/scl;
      let min = this.mMinPar;
      let max = this.mMaxPar;

      let data;
      try {
	data = JSON.parse(obj.getHistogramJSON(min, max, nbin));
      }
      catch (e) {
	debug.exception(e);
	return;
      }
      
      dd(">>>>>>>>>>>>> nbin="+nbin);
      
      ctx.fillStyle = "rgb(0,0,0)";
      let h = canvas.height;
      for (let i=0; i<nbin; ++i) {
	let val = data.histo[i] / data.nmax;
	dd("i="+i+", dat="+data.histo[i]+", nmax="+data.nmax+", val="+val);
	ctx.fillRect(i*scl, (1.0-val)*h, scl, val*h);
      }
    };

    klass.onItemClick = function (aEvent, elem, col)
    {
      var elem = this.mTreeView.getSelectedNode();
      //this.mColTgt = elem;
      if (!elem) {
	//this.mAddBtn.disabled = true;
	this.mDelBtn.disabled = true;
	return;
      }
      
      //alert("elem.name="+elem.name);
      //dd("event="+debug.dumpObjectTree(aEvent,0));
      //this.enableColNameValBoxes(true);
      //this.mParBox.value = parseFloat(elem.name);
      this.mParBox.value = elem.values.par_value;
      this.mColBox.setColorText(elem.values.color_value);

      //this.mAddBtn.disabled = false;
      this.mDelBtn.disabled = false;
    }

    klass.onParChanged = function (aEvent)
    {
      let elem = this.mTreeView.getSelectedNode();
      if (!elem)
	return;

      dd("onParChanged called for "+elem.name);

      let bKR = this.mKRBtn.checked;
      let nodes = this.mTreeView.getData();
      let newval = parseFloat(this.mParBox.value);

      if (bKR) {
	// shift all nodes with keeping the ratio

	let nrows = this.mTreeView.getRowCount();
	let irow = this.mTreeView.getSelectedRow();

	let par_min = nodes[0].values.par_value;
	let par_max = nodes[nrows-1].values.par_value;
	let oldval = nodes[irow].values.par_value;

	if (irow>0 && irow<nrows-1) {
	  if (newval - par_min<0.001 ||
	      par_max - newval<0.001 ||
	      oldval - par_min<0.001 ||
	      par_max - oldval<0.001) {
	    // spacing is too small --> cancel the change
	    this.mParBox.value = elem.values.par_value;
	    return;
	  }
	}
	
	let del = oldval - par_min;
	let new_del = newval - par_min;
	for (i=1; i<irow; ++i) {
	  let oval = nodes[i].values.par_value;
	  let nval = (oval-par_min)/del*new_del + par_min;
	  //dd("node "+i+" new par="+nval);
	  nodes[i].name = nval.toFixed(2);
	  nodes[i].values.par_value = nval;
	}
	
	nodes[irow].name = newval.toFixed(2);
	nodes[irow].values.par_value = newval;
	
	del = par_max - oldval;
	new_del = par_max - newval;
	for (i=irow+1; i<nrows-1; ++i) {
	  let oval = nodes[i].values.par_value;
	  let nval = (oval-oldval)/del*new_del + newval;
	  //dd("node "+i+" new par="+nval);
	  nodes[i].name = nval.toFixed(2);
	  nodes[i].values.par_value = nval;
	}

      }
      else {
	// change only the target node
	elem.name = newval.toFixed(2);
	elem.values.par_value = newval;
	this.sortNodes( nodes );
      }
      
      this.updateMinMax( nodes );

      // update all nodes
      this.mTreeView.buildView();

      // reselect the target node
      this.mTreeView.selectNodeByFunc(function (node) { return node==elem; });

      this.setupPreview(nodes);
    };
    
    klass.onColChanged = function (aEvent)
    {
      var elem = this.mTreeView.getSelectedNode();
      if (!elem)
	return;

      dd("onColChanged called for "+elem.name);

      let newval = this.mColBox.getColorObj();
      dd("onColChg> new color val="+newval.toString());
      // elem.rgbcol = makeRGBCol();
      elem.values.color_value = newval.toString();
      elem.values.html_colstr = util.getHTMLColor(newval);

      let nodes = this.mTreeView.getData();
      this.realizeNodeColors( nodes );

      this.setupPreview(nodes);

      this.mTreeView.saveSelection();
      this.mTreeView.buildView();
      this.mTreeView.restoreSelection();
      
    };

    klass.createNewNode = function (aPar, aColStr)
    {
      let col = cuemol.makeColor(aColStr);
      let htmlcol = util.getHTMLColor(col);
      
      var newnode = new Object();
      newnode.name = aPar.toFixed(2);
      newnode.values = {
	'par_value' : aPar,
	'color_value': aColStr,
	'html_colstr': htmlcol
	};

      return newnode;
    };

    klass.onAddNode = function (aEvent)
    {
      var newpar = 0.0;
      var newval = "rgb(1,1,1)";

      var elem = this.mTreeView.getSelectedNode();
      if (elem) {
	// Duplicate the current selection if available
	newpar = elem.values.par_value;
	newval = elem.values.color_value;
      }

      var newnode = this.createNewNode(newpar, newval);

      let nodes = this.mTreeView.getData();
      nodes.push(newnode);

      this.sortNodes( nodes );
      this.updateMinMax( nodes );
      this.realizeNodeColors( nodes );

      this.setupPreview(nodes);

      this.mTreeView.saveSelection();
      this.mTreeView.buildView();
      this.mTreeView.restoreSelection();
    };

    klass.onDelNode = function (aEvent)
    {
      var irow = this.mTreeView.getSelectedRow();
      if (irow<0)
	return;

      this.mTreeView.removeNodeIndex(irow, 1);

      let nodes = this.mTreeView.getData();
      this.updateMinMax( nodes );
      this.setupPreview( nodes );
    };
    
    klass.onDelAllNodes = function (aEvent)
    {
      let nodes = new Array();
      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();
      this.setupPreview( nodes );
    };
    
    klass.onPresetSel = function (aEvent)
    {
      let nodes = new Array();
      let value = aEvent.target.value;
      
      let rend = cuemol.getRenderer(this.mRendID);
      // let obj = rend.getClientObj();
      let obj = rend.getColorMapObj();

      let mean = obj.den_mean;
      let sig = obj.den_sigma;
      let dmin = obj.den_min;
      let dmax = obj.den_max;

      if (value=="rainbow1") {
	/*
	// rainbow color from -3 sig to +3 sig
	nodes.push( this.createNewNode(-2.0*sig+mean, "#FF0000") );
	nodes.push( this.createNewNode(-1.0*sig+mean, "#FFFF00") );
	nodes.push( this.createNewNode( 0.0*sig+mean, "#00FF00") );
	nodes.push( this.createNewNode( 1.0*sig+mean, "#00FFFF") );
	nodes.push( this.createNewNode( 2.0*sig+mean, "#0000FF") );
	nodes.push( this.createNewNode( 3.0*sig+mean, "#FF00FF") );
	 */
	// Rainbow color regular interval between min and max
	let delta = (dmax-dmin)/5.0;
	nodes.push( this.createNewNode(dmin, "#FF0000") );
	nodes.push( this.createNewNode(dmin + delta, "#FFFF00") );
	nodes.push( this.createNewNode(dmin + delta*2, "#00FF00") );
	nodes.push( this.createNewNode(dmin + delta*3, "#00FFFF") );
	nodes.push( this.createNewNode(dmin + delta*4, "#0000FF") );
	nodes.push( this.createNewNode(dmin + delta*5, "#FF00FF") );
      }
      else if (value=="resmap1") {
	// Resmap color regular interval between min and max
	let delta = (dmax-dmin)/4.0;
	nodes.push( this.createNewNode(dmin, "#0F77CF") );
	nodes.push( this.createNewNode(dmin + delta, "#87E3E7") );
	nodes.push( this.createNewNode(dmin + delta*2, "#FFFFFF") );
	nodes.push( this.createNewNode(dmin + delta*3, "#CF8FAF") );
	nodes.push( this.createNewNode(dmin + delta*4, "#9E205E") );
      }
      else if (value=="heatmap1") {
	// heatmap color with regular interval between min and max
	let delta = dmax-dmin;
	nodes.push( this.createNewNode(dmin, "Red") );
	nodes.push( this.createNewNode(dmin + delta*0.6666, "Yellow") );
	nodes.push( this.createNewNode(dmax, "White") );
      }

      this.sortNodes( nodes );
      this.updateMinMax( nodes );
      this.realizeNodeColors(nodes);

      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();

      this.setupPreview(nodes);
    };

    klass.createGrad = function (aNodes)
    {
      let res = cuemol.createObj("MultiGradient");
      let nlen = aNodes.length;
      let i, col, val;

      for (i=0; i<nlen; ++i) {
	let elem = aNodes[i];
	val = elem.values.par_value;
	col = elem.values.color_value;
	res.insert( val, cuemol.makeColor(col) );
      }

      return res;
    };

    klass.onPreview = function (aEvent)
    {
      if (this.mOrigGrad==null) {
	// Save the original gradient (for preview/undo)
	this.mOrigGrad = cuemol.createObj("MultiGradient");
	let rend = cuemol.getRenderer(this.mRendID);
	this.mOrigGrad.copyFrom(rend.multi_grad);
      }

      let grad = this.createGrad( this.mTreeView.getData() );
      let rend = cuemol.getRenderer(this.mRendID);
      rend.multi_grad.copyFrom( grad );
      
      return true;
    };

    klass.onDialogAccept = function (aEvent)
    {
      this.resetToOrigGrad();
      let rend = cuemol.getRenderer(this.mRendID);
      let scene = rend.getScene();

      // // EDIT TXN START //
      scene.startUndoTxn("Change multi gradient color");
      try {
	let grad = this.createGrad( this.mTreeView.getData() );
	rend.multi_grad.copyFrom( grad );
      }
      catch (e) {
	debug.exception(e);
	scene.rollbackUndoTxn();
	util.alert(window, "Error: "+cuemol.getErrMsg());
	return false;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //
      
      return true;
    };

    klass.onDialogCancel = function (aEvent)
    {
      this.resetToOrigGrad();
      return true;
    };

    klass.resetToOrigGrad = function ()
    {
      if (this.mOrigGrad!=null) {
	// reset to the original grad
	let rend = cuemol.getRenderer(this.mRendID);
	rend.multi_grad.copyFrom( this.mOrigGrad );
      }
    };

    return ctor;

  } ) ();
}

window.gMain = new cuemolui.MultiGradEditor();

