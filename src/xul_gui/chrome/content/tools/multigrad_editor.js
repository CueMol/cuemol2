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

      // set onload handler
      addEventListener("load", function() {
	try { that.onLoad(); } catch (e) { debug.exception(e); }
      }, false);


      this.mTreeView = new cuemolui.TreeView(window, "paint-listbox");
      this.mTreeView.clickHandler = function (ev, row, col) {
	that.onItemClick(ev, row, col);
      }
      //this.mTreeView.defCtxtMenuId = "paintPanelCtxtMenu";

      // dummy serial number to invalidate the CSS color (for paint listbox)
      this._serial = 0;

      dd("MultiGradEditor> taget scene UID="+this.mSceneID);
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      // _onLoad is not called by event (or after this event...)
      this.mTreeView._onLoad();

      let that = this;

      let rend = cuemol.getRenderer(this.mRendID);
      if (!'colormode' in rend || rend.colormode!="multigrad") {
	// ERROR!!
	return;
      }

      this.mParBox = document.getElementById("edit-param");
      this.mColBox = document.getElementById("edit-color");

      // color_mapname

      // multi_grad
      this.setupListBox(rend);
      this.setupPreview(rend);
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

    klass.setPaintColCSS = function (aPropName, aColor)
    {
      var strcol = "rgb("+aColor.r()+","+aColor.g()+","+aColor.b()+")";
      
      var ss = document.styleSheets[document.styleSheets.length-1];
      var propnm = aPropName; //"col"+aInd;
      var insid = ss.insertRule("#paint-listbox-children::-moz-tree-cell("+propnm+") {}",
				ss.cssRules.length);
      var sr = ss.cssRules[insid];
      sr.style.backgroundColor = strcol;
    }
    
    klass.setupListBox = function (aRend)
    {
      let coloring = aRend.multi_grad;

      // remove existing rules
      this.removePaintColCSS();
      
      var i, col, sel, nlen = coloring.size;
      var nodes = new Array();
      
      for (i=0; i<nlen; ++i) {
	let sel = coloring.getValueAt(i);
	let col = coloring.getColorAt(i);

        dd("par="+sel+", col="+col);
        var node = new Object();
        node.obj_id = i;
        node.name = sel.toString();
        node.values = { color_value: col.toString() };
	var propval = "col_"+this._serial+"_"+i;
        node.props = { color_value: propval };
	nodes.push(node);
	this.setPaintColCSS(propval, col);
      }
      
      ++this.serial;
      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();
    };
    
    klass.setupPreview = function (aRend)
    {
      let coloring = aRend.multi_grad;
      //let obj = aRend.getClientObj();
      let obj = aRend.getColorMapObj();
      
      let i, col, sel;
      let nlen = coloring.size;

      let min_lab = document.getElementById("min_value");
      let max_lab = document.getElementById("max_value");
      let grad_elem = document.getElementById("preview_grad");

      // remove all gradient stops
      while (grad_elem.firstChild)
	grad_elem.removeChild(grad_elem.firstChild);
      
      let dmin = obj.den_min;
      let dmax = obj.den_max;
      min_lab.value = dmin.toFixed(2);
      max_lab.value = dmax.toFixed(2);

      for (i=0; i<nlen; ++i) {
	let val = coloring.getValueAt(i);
	let col = coloring.getColorAt(i);

	dd("par="+val+", col="+col);
	let rho = (val-dmin)/(dmax-dmin);

	let strcol = "rgb("+col.r()+","+col.g()+","+col.b()+")";

	let stop_elem = document.createElementNS("http://www.w3.org/2000/svg", "stop");
	stop_elem.setAttribute("offset", rho);
	stop_elem.setAttribute("stop-color", strcol);
	grad_elem.appendChild(stop_elem);
      }
      
    };

    klass.onItemClick = function (aEvent, elem, col)
    {
      var elem = this.mTreeView.getSelectedNode();
      //this.mColTgt = elem;
      if (!elem) {
	//this.enableColNameValBoxes(false);
	return;
      }
      
      //this.enableColNameValBoxes(true);
      this.mParBox.value = parseFloat(elem.name);
      this.mColBox.setColorText(elem.values.color_value);
    }

    klass.onDialogAccept = function ()
    {
      return true;
    };

    return ctor;

  } ) ();
}

window.gMain = new cuemolui.MultiGradEditor();

