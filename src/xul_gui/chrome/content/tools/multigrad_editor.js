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
	that.onPaintItemClick(ev, row, col);
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

      // color_mapname

      // multi_grad
      this.setupListBox(rend);
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
        node.values = { paint_value: col.toString() };
	var propval = "col_"+this._serial+"_"+i;
        node.props = { paint_value: propval };
	nodes.push(node);
	this.setPaintColCSS(propval, col);
      }
      
      ++this.serial;
      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();
    };
    
    klass.onDialogAccept = function ()
    {
      return true;
    };

    return ctor;

  } ) ();
}

window.gMain = new cuemolui.MultiGradEditor();

