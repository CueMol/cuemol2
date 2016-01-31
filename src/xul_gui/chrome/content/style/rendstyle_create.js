//
// rendstyle_create.js
//   RendStyle creation dialog implementation
//

if (!("RendStyleCreate" in cuemolui)) {
  cuemolui.RendStyleCreate = ( function () {

    /// Constructor
    var ctor = function ()
    {
      let that = this;
      this.mStylem = cuemol.getService("StyleManager");

      // get arguments (scene id)
      var args = this.mArgs = window.arguments[0]; //.QueryInterface(Ci.xpcIJSWeakReference).get(); 
      this.mSceneID = args.scene_id;
      this.mRendID = args.rend_id;

      // set onload handler
      addEventListener("load", function() {
	try { that.onLoad(); } catch (e) { debug.exception(e); }
      }, false);


      dd("RendStyleCreate> taget scene UID="+this.mSceneID);
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      let that = this;

      this.mSSetList = document.getElementById("styleset-list");
      //this.mRendStyList = document.getElementById("rendstyle-list");

      this.mRendStyName = document.getElementById("rendstyle-name");
      this.mOrigRendDesc = document.getElementById("orig-rend");

      /*
      // set selection event handler for RendSelList
      this.mRendStyList.addEventListener("select", function(event) {
	try { that.onSelRendStyItem(event); } catch (e) { debug.exception(e); }
      }, false);
       */

      // set selection event handler for SelSetList
      this.mSSetList.addEventListener("select", function(event) {
	try { that.onSelSSetItem(event); } catch (e) { debug.exception(e); }
      }, false);

      this.populateStyleSetList();

      let rend = cuemol.getRenderer(this.mRendID);
      this.mRendName = rend.name;
      this.mRendTypeName = rend.type_name;
      this.mOrigRendDesc.value = rend.name+" ("+rend.type_name+")";

      let w = document.getElementById("rendstyle-postfix");
      w.value = rend.type_name;
    };

    klass.onDialogAccept = function ()
    {
      let res_name = this.mRendStyName.value;
      let res_selset = this.mSSetList.selectedItem.value;
      
      let setobj = this.getStyleSet(res_selset);
      let stynames = this.getStyleNames(res_selset);

      let nlen = stynames.length;
      let res_name_lc = (res_name+this.mRendTypeName).toLowerCase();
      for (let i=0; i<nlen; ++i) {
	let tst = stynames[i].name.toLowerCase();
	dd("comp: "+tst+"<->"+res_name_lc);
	if (tst==res_name_lc) {
	  let res = confirm("Style "+stynames[i].name+" is already defined in "+res_selset+". Overwrite?");
	  if (!res)
	    return false;
	}
      }

      // set return value
      var args = this.mArgs;
      args.bOK = true;
      
      args.style_name = res_name+this.mRendTypeName;
      args.style_desc = res_name;
      args.style_setname = res_selset;
      args.style_setid = setobj.uid;
      
      dd("Create rend style; name="+args.style_name+"; desc="+args.style_desc+"; in "+args.style_setname);
      return true;
    };

    klass.populateStyleSetList = function ()
    {
      let json_str = this.mStylem.getStyleSetsJSON(0);
      let styles = JSON.parse(json_str);
      dd("style set 0: "+json_str);
      
      json_str = this.mStylem.getStyleSetsJSON(this.mSceneID);
      styles = styles.concat( JSON.parse(json_str) );
      dd("style set "+this.mSceneID+": "+json_str);

      let nlen = styles.length;
      if (nlen==0) {
	return;
      }


      util.clearMenu(this.mSSetList);
      let selitem = null;
      for (let i=0; i<nlen; ++i) {
	if (styles[i].readonly)
	  continue;
	let name = styles[i].name;
	if (name=="system" && styles[i].scene_id==0)
	  continue;
	let label = name;
	if (label=="")
	  label = "(anonymous)";

	dd("  item="+name);
	let item = this.mSSetList.appendItem(label, name);

	if (styles[i].scene_id!=0)
	  selitem = item;
      }

      if (selitem)
	this.mSSetList.selectedItem = selitem;
      else
	this.mSSetList.selectedIndex = 0;
    };

    klass.onSelSSetItem = function (event)
    {
      let selset = this.mSSetList.selectedItem.value;
      // this.populateRendStyList(selset);
    };

    klass.getStyleSet = function (selset)
    {
      let ssetid = this.mStylem.hasStyleSet(selset, this.mSceneID);
      let sset = this.mStylem.getStyleSet(ssetid);
      if (sset==null) {
	ssetid = this.mStylem.hasStyleSet(selset, 0);
	sset = this.mStylem.getStyleSet(ssetid);
	if (sset==null) {
	  dd("ERROR!! invalid styleset: "+selset);
	  return null;
	}
      }
      return sset;
    }
    
    klass.getStyleNames = function (selset)
    {
      let sset = this.getStyleSet(selset);
      let json_str = sset.getStyleNamesJSON();
      dd("json="+json_str);
      let styles = JSON.parse(json_str);

      return styles;
    };
    

    klass.populateRendStyList = function (selset)
    {
      dd("populateRendStyList for "+selset);

      let styles = this.getStyleNames(selset);

      util.clearMenu(this.mRendStyList);
      this.mRendStyList.inputField.value = "";
      this.mRendStyName.value = "";

      let nlen = styles.length;
      if (nlen==0) {
	return;
      }

      let rend = cuemol.getRenderer(this.mRendID);
      let rend_type = "(.+)" + rend.type_name + "$";
      let re = RegExp(rend_type, "i");

      this.mStyles = {};
      for (let i=0; i<nlen; ++i) {
	if (styles[i].type!="renderer") continue;
	let name = styles[i].name;
	let desc = styles[i].desc;

	this.mStyles[name] = desc;

	let res = re.exec(name);
	if (res==null) continue;
	//let label = name+"("+desc+")";
	let label = res[1];

	dd("  item="+name);
	this.mRendStyList.appendItem(label, name);
      }
    };
    
    klass.onSelRendStyItem = function (event)
    {
      let selsty = this.mRendStyList.selectedItem.value;
      dd("selected rend style: "+selsty);
      let desc = this.mStyles[selsty];
      if (desc)
	this.mRendStyName.value = desc;
    };

    return ctor;

  } ) ();
}

window.gMain = new cuemolui.RendStyleCreate();

