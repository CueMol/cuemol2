//////////

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function myAppHandler() {}

myAppHandler.prototype =
{
  classID: Components.ID("{4349a533-9aa1-4760-85ef-f537cc69d13c}"),

  /* nsISupports */

// QueryInterface : XPCOMUtils.generateQI([Components.interfaces.nsICommandLineHandler]),
//  QueryInterface : XPCOMUtils.generateQI([Components.interfaces.nsISupports]),

  QueryInterface : function clh_QI(iid)
  {
    if (iid.equals(Components.interfaces.nsICommandLineHandler) ||
        iid.equals(Components.interfaces.nsIFactory) ||
        iid.equals(Components.interfaces.nsISupports))
      return this;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
  
  /* nsICommandLineHandler */

  handle : function clh_handle(cmdLine)
  {
    // dump(">>>>>>>>>> nsICLH handle() called!! <<<<<<<<<<\n");
    //cmdLine.preventDefault = true;

    var singletonWindowType = "cuemol2";

    var windowMediator =
      Components.classes["@mozilla.org/appshell/window-mediator;1"]
	.getService(Components.interfaces.nsIWindowMediator);

    var win = windowMediator.getMostRecentWindow(singletonWindowType);
    if (win) {
      dump(">>>>>>>>>> clh_handle window = "+win.gQm2Main.loadNewTab+"\n");
      //win.alert(dumpObjectTree(win));
      //win.alert("win="+win);
      win.focus();
      win.gQm2Main.openFromShell(cmdLine);
      cmdLine.preventDefault = true;
      return;
    }
    

    return;
  },

  helpInfo : ""

};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([myAppHandler]);

