//
// apply_rend_style.js
//   Apply rendere's style dialog implementation
//

if (!("ApplyRendStyle" in cuemolui)) {
  cuemolui.ApplyRendStyle = ( function () {

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


      dd("ApplyRendStyle> taget scene UID="+this.mSceneID);
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      let that = this;

    };

    klass.onDialogAccept = function ()
    {
      return true;
    };


    return ctor;

  } ) ();
}

window.gMain = new cuemolui.ApplyRendStyle();

