const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

//////////

const DEBUG_LOG_PATH = "/tmp/myapp-clh-debug.log";

var DebugLogger = {
    _file: null,
    _stream: null,
    
    init: function() {
        try {
            this._file = Cc["@mozilla.org/file/local;1"]
                           .createInstance(Ci.nsIFile);
            this._file.initWithPath(DEBUG_LOG_PATH);
        } catch(e) {}
    },
    
    // log: function(msg) {
    //     try {
    //         if (!this._file) this.init();
            
    //         let foStream = Cc["@mozilla.org/network/file-output-stream;1"]
    //                          .createInstance(Ci.nsIFileOutputStream);
    //         foStream.init(this._file, 0x02 | 0x08 | 0x10, 0o644, 0);
            
    //         let ts = new Date().toISOString();
    //         let line = "[" + ts + "] " + msg + "\n";
    //         foStream.write(line, line.length);
    //         foStream.close();
            
    //         dump(line);
    //     } catch(e) {
    //         dump("DebugLogger error: " + e + "\n");
    //     }
    // }

    log: function(msg) {
      let ts = new Date().toISOString();
      let line = "[" + ts + "] " + msg + "\n";
      dump(line);
    }
};

DebugLogger.log("=== Application starting ===");
DebugLogger.log(">>>>>>>>>> cuemol2-cmdline.js called!! <<<<<<<<<<");

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
const nsICommandLineHandler = Ci.nsICommandLineHandler;
const nsIObserver = Ci.nsIObserver;
const singletonWindowType = "cuemol2:mainwnd";

function CueMol2CLH() {}

var gCmdLine = null;

CueMol2CLH.prototype =
{
  classID: Components.ID("{4349a533-9aa1-4760-85ef-f537cc69d13c}"),

  /* nsISupports */

  QueryInterface : XPCOMUtils.generateQI([nsICommandLineHandler, nsIObserver]),
  
  /* nsICommandLineHandler */

  handle : function clh_handle(cmdLine)
  {
    DebugLogger.log(">>>>>>>>>> nsICLH handle() called!! state="+cmdLine.state+"<<<<<<<<<<\n");

    var windowMediator =
      Components.classes["@mozilla.org/appshell/window-mediator;1"]
	.getService(Components.interfaces.nsIWindowMediator);

    var win = windowMediator.getMostRecentWindow(singletonWindowType);
    DebugLogger.log(">>>>>>>>>> nsICLH handle() win="+win+" <<<<<<<<<<\n");
    if (win) {
      DebugLogger.log(">>>>>>>>>> clh_handle win.gQm2Main = "+win.gQm2Main);
      //win.alert(dumpObjectTree(win));
      //win.alert("win="+win);
      win.focus();
      DebugLogger.log("clh_handle win.gQm2Main.openFromShell = "+win.gQm2Main.openFromShell);
      this.openCmdLine(win, cmdLine);
      // win.gQm2Main.openFromShell(cmdLine);
      DebugLogger.log(">>>>>>>>>> clh_handle win.gQm2Main.openFromShell OK");
      cmdLine.preventDefault = true;
      return;
    }
    
    if (cmdLine.state == Ci.nsICommandLine.STATE_INITIAL_LAUNCH) {
      // this.debugCmdLine(cmdLine);
      let os = Cc["@mozilla.org/observer-service;1"]
          .getService(Ci.nsIObserverService);
      os.addObserver(this, "domwindowopened", false);
      DebugLogger.log("observer domwindowopened registered");
    }
    else if (cmdLine.state == Ci.nsICommandLine.STATE_REMOTE_EXPLICIT) {
      // this.debugCmdLine(cmdLine);
      gCmdLine = cmdLine;
      cmdLine.preventDefault = true;
      DebugLogger.log("STATE_REMOTE_AUTO called: gCmdLine="+gCmdLine);
    }
    DebugLogger.log(">>>>>>>>>> clh_handle cmdLine.preventDefault = "+cmdLine.preventDefault);
  },

  helpInfo : "",

  /* nsIObserver */
  observe: function(subject, topic, data) {
    DebugLogger.log(">>>>>>>>>> nsIObsv observe() topic="+topic);

    if (topic != "domwindowopened") return;
    
    let os = Cc["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    os.removeObserver(this, "domwindowopened");
        
    let win;
    try {
        win = subject.QueryInterface(Ci.nsIDOMWindow);
    } catch(e) {
        DebugLogger.log("Failed to QI window: " + e);
        return;
    }
    DebugLogger.log(">>>>>>>>>> nsIObsv observe() win="+win);

    var that = this;
    win.addEventListener("load", function onLoad() {
      win.removeEventListener("load", onLoad);
      that.onLoad(win);
    }, false);
  },

  onLoad: function(win) {
    let wtype = win.document.documentElement.getAttribute("windowtype") || "";
    DebugLogger.log(">>>>>>>>>> onLoad win.gQm2Main = "+win.gQm2Main+" windowtype: "+wtype);
    
    if (wtype != singletonWindowType) {
        DebugLogger.log("Not main window: "+wtype);
        return;
    }

    if (!win.gQm2Main) {
      DebugLogger.log("win.gQm2Main not ready yet");
      return;
    }

    DebugLogger.log("App fully initialized: "+gCmdLine);
    if (gCmdLine) {
      // this.debugCmdLine(gCmdLine);
      this.openCmdLine(win, gCmdLine);
    }

  },

  openCmdLine: function(win, cmdLine) {
    try {
      win.setTimeout( function () {
        win.gQm2Main.openFromShell(cmdLine);
        // win.alert("OK");
      }, 0);
    } catch(e) {
      DebugLogger.log("Error in openFromShell: "+e);
    }
  },

  debugCmdLine: function (cmdLine) {
    var nlen = cmdLine.length;
    // alert("cmdline length="+nlen);
    var clfs = new Array();
    
    for (var i=0; i<nlen; ++i) {
	  var uri = cmdLine.getArgument(i);
      DebugLogger.log("i="+i+": cmdLine arg="+uri);
    }
  }

};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([CueMol2CLH]);
