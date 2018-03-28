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

      // color_mapname

      // multi_grad
      this.setupListBox(rend);
      //this.setupPreview(rend);
      this.setupPreview(this.mTreeView.getData());
    };

    klass.removePaintColCSS = function ()
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
    }

    klass.setupListBox = function (aRend)
    {
      let coloring = aRend.multi_grad;

      // remove existing rules
      this.removePaintColCSS();
      
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
      let node, propval;
      const nsize = aNodes.length;
      for (let i=0; i<nsize; ++i) {
	node = aNodes[i];
	// node.obj_id = i;
	propval = "col_"+this.mSerial+"_"+i;
	node.props = { color_value: propval };
	this._setColCSS(node);
      }
      ++this.mSerial;
    };

    klass._setColCSS = function (aNode)
    {
      var ss = document.styleSheets[document.styleSheets.length-1];
      var propnm = aNode.props.color_value;
      var insid = ss.insertRule("#color-listbox-children::-moz-tree-cell("+propnm+") {}",
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

      this.mMinPar = min_par;
      this.mMaxPar = max_par;
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
      var elem = this.mTreeView.getSelectedNode();
      if (!elem)
	return;

      dd("onParChanged called for "+elem.name);

      let newval = parseFloat(this.mParBox.value);
      elem.name = newval.toFixed(2);
      elem.values.par_value = newval;

      let nodes = this.mTreeView.getData();
      this.sortNodes( nodes );
      this.updateMinMax( nodes );

      // update all nodes
      //this.mTreeView.updateNode(function (node) { return true; });
      this.mTreeView.buildView();
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

    klass.onAddNode = function (aEvent)
    {
      var elem = this.mTreeView.getSelectedNode();
      var newpar = 0.0;
      var strcol = "#FFFFFF";
      var newval = "rgb(1,1,1)";
      if (elem) {
	// Duplicate the current selection if available
	newpar = elem.values.par_value;
	newval = elem.values.color_value;
	strcol = elem.values.html_colstr;
      }

      var newnode = new Object();
      newnode.name = newpar.toFixed(2);
      newnode.values = {
	'par_value' : newpar,
	'color_value': newval,
	'html_colstr': strcol
	};

      //this.mColDefs.splice(ind, 0, newnode);
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
    
    klass.onDialogAccept = function ()
    {
      return true;
    };

    return ctor;

  } ) ();
}

window.gMain = new cuemolui.MultiGradEditor();

