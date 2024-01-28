//
// logpanel.js: log output bottom-panel implementation
//

if (!("logpanel" in cuemolui)) {

  ( function () {
    let panel = cuemolui.logpanel = new Object();

    addEventListener("load", function () {panel.onLoad();}, false);
    addEventListener("unload", function () {panel.onUnLoad();}, false);

    panel.scrollToBottom = function ()
    {
      const pos = this.mLogWnd.value.length;
      this.mLogWnd.selectionStart = pos;
      this.mLogWnd.selectionEnd = pos;
    }

    panel.onLoad = function ()
    {
      const logMgr = cuemol.getService("MsgLog");
      const accumMsg = logMgr.getAccumMsg();
      logMgr.removeAccumMsg();

      let that = this;
      // setup log display iframe
      if (!this.mLogWnd) {
        this.mLogWnd = document.getElementById("log_content");
        this.mLogWnd.value = accumMsg;
        this.scrollToBottom();
      }
      
      const handler = function (args) {
	let msg = args.obj.content;
	if (args.obj.newline)
	  msg += "\n";
        that.mLogWnd.value += msg;
        that.scrollToBottom();
      };

      this.m_cbid =
	cuemol.evtMgr.addListener("log",
				  cuemol.evtMgr.SEM_ANY, // source type
				  cuemol.evtMgr.SEM_ANY, // event type
				  cuemol.evtMgr.SEM_ANY, // source uid
				  handler);

      dd("logwnd callbackID="+this.m_cbid);

      this.mCmdBox = document.getElementById("output_cmdbox");
      this.mCmdBox.addEventListener("keypress", function (e) {panel.onKeyPress(e);}, false);
      
      this.mTabMolView = document.getElementById("main_view");

      // check scripting interfaces
      this.mPyBr = null;
      if (cuemol.hasClass("PythonBridge")) {
        try {
          pybr = cuemol.getService("PythonBridge");
          if (pybr) {
            this.mPyBr = pybr;
          }
        }
        catch (e) {}
      }

      let prom = document.getElementById("cmd_prompt_label");
      if (this.mPyBr) {
        prom.value="Py>";
      }
      else {
        prom.value="Js>";
      }

      // Setup history array
      // this.mCmdHis = [];
      this.mCmdHis = new util.History("cmd_prompt_history", 100);
      this.mCmdHis.loadFromPref();
      this.mHisPos = this.mCmdHis.getLength();
    };
    
    panel.onUnLoad = function ()
    {
      if (this.m_cbid)
	cuemol.evtMgr.removeListener(this.m_cbid);
    };
    
    panel.onCommand = function (aEvent)
    {
      dd("command event");
    };

    panel.onKeyPress = function (aEvent)
    {
      // dd("command event: "+aEvent.keyCode);
      if (aEvent.keyCode==Ci.nsIDOMKeyEvent.DOM_VK_RETURN) {
	cuemol.putLogMsg("> "+this.mCmdBox.value);
	this.execCmd(this.mCmdBox.value);
	this.mCmdBox.value = "";
      }
      else if (aEvent.keyCode==Ci.nsIDOMKeyEvent.DOM_VK_UP) {
        if (this.mHisPos>0) {
          this.mHisPos--;
          //this.mCmdBox.value = this.mCmdHis[this.mHisPos];
          this.mCmdBox.value = this.mCmdHis.getEntry(this.mHisPos);

          let n = this.mCmdBox.value.length;
          let that = this;
          setTimeout( function () { that.mCmdBox.setSelectionRange(n, n); }, 0);
	  
        }
      }
      else if (aEvent.keyCode==Ci.nsIDOMKeyEvent.DOM_VK_DOWN) {
	// if (this.mHisPos<this.mCmdHis.length) {
        if (this.mHisPos<this.mCmdHis.getLength()) {
          this.mHisPos++;
          // if (this.mHisPos<this.mCmdHis.length) {
          if (this.mHisPos<this.mCmdHis.getLength()) {
            // this.mCmdBox.value = this.mCmdHis[this.mHisPos];
            this.mCmdBox.value = this.mCmdHis.getEntry(this.mHisPos);
            
            let n = this.mCmdBox.value.length;
            let that = this;
            setTimeout( function () { that.mCmdBox.setSelectionRange(n, n); }, 0);
          }
          else
            this.mCmdBox.value = "";
        }
      }

    };

    panel.execCmd = function (aCmd)
    {
      if (this.mPyBr) {
        // use python
        try {
          this.mPyBr.runString(aCmd);
        }
        catch (e) {
          cuemol.putLogMsg(e.message);
          debug.exception(e);
        }
      }
      else {
        // use js
        try {
          let scene = this.mTabMolView.currentSceneW;
          let fun = new Function("scene", aCmd);
          fun(scene);
          //eval(aCmd);
        }
        catch (e) {
          cuemol.putLogMsg(e.message);
        }
      }

      // this.mCmdHis.push(aCmd);
      this.mCmdHis.push(aCmd);
      // this.mHisPos = this.mCmdHis.length;
      this.mHisPos = this.mCmdHis.getLength();

      // cuemol.putLogMsg(this.mCmdHis.dumpToStr());

      this.mCmdHis.saveToPref();
    };

    panel.clearLogContents = function ()
    {
      this.mLogWnd.value = "";
    };

  } )();
}

