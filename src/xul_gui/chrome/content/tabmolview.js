// -*-Mode: C++;-*-
//
//  Tabbed molecular viewer
//
// $Id: tabmolview.js,v 1.24 2011/02/20 09:34:26 rishitani Exp $
//

// dump("loading tabmolview.js ....\n");

if (!("TabMolView" in cuemolui)) {

  cuemolui.TabMolView = ( function() {

    const nwmgr = require("native-widget");

    // constructor
    var ctor = function (aOuter)
    {
      this._outer = aOuter;

      this.mHoverTimeoutID = null;
      this.mHoverDelay = 1000;
      this.mToolTip = document.getElementById("tabmolview-tooltip");
      this.mActiveViewID = null;

      this.mCurrentScene = null;
      this.mCurrentView = null;
      this.mCurrentFrm = null;

      var that = this;
      this._callbackID = cuemol.evtMgr.addListener(
        "",
        cuemol.evtMgr.SEM_SCENE, //|cuemol.evtMgr.SEM_VIEW, // source type
        cuemol.evtMgr.SEM_PROPCHG, // event type
        0, // source UID (ANY)
        function (args) { that.onScenePropChanged(args); });

#ifdef XP_MACOSX
      // MacOS X specific: This code is required to re-activate (show) the native window,
      //  after restoring the minimized state
      window.addEventListener("activate", function(aEvent) {
        //dd("XXXX activate XXXX: "+debug.dumpObjectTree(aEvent));
        dd("XXXX activate XXXX: "+aEvent.target.windowState);

        /*if (aEvent.target.windowState==Ci.nsIDOMChromeWindow.STATE_MINIMIZED &&
            that.mCurrentFrm && that.mCurrentFrm.native_window) {
          that.mCurrentFrm.native_window.hide();
          that.mCurrentFrm.native_window.show();
	  }*/

	if (that.mCurrentFrm &&
	    that.mCurrentFrm.native_window) {
	  setTimeout( function () {
	      that.mCurrentFrm.native_window.hide();
	      that.mCurrentFrm.native_window.show();
	    }, 0);
	}

      }, false);
#endif

      window.addEventListener("unload", function() {
        dd("TABMOLVIEW: unload called --> unregister evt listnr.");
        cuemol.evtMgr.removeListener(that._callbackID);
        that._callbackID = null;
        delete that.mCurrentScene;
        delete that.mCurrentView;
      }, false);

      aOuter.mPanelContainer.addEventListener("select", function(ev) { try {
        that.onTabSelect(ev);
      } catch (e) {debug.exception(e);} }, false);

      var tabsel_popup = aOuter.mTabContainer.mAllTabsPopup;
      tabsel_popup.addEventListener("popupshowing", function(ev) { try {
        that.populateAllTabMenu(ev);
      } catch (e) {debug.exception(e);} }, false);
      tabsel_popup.addEventListener("command", function(ev) { try {
        that.onCmdTabMenu(ev);
      } catch (e) {debug.exception(e);} }, false);

      //////////
      // View key-shortcut registration (XXX: move to xul files?)

      try {
        cuemolui.shortcut.reg("view-trans-plusx", "VK_RIGHT", "control", function (id) {
          that.onShortcutEvent(id); } );
        cuemolui.shortcut.reg("view-trans-minusx", "VK_LEFT", "control", function (id) {
          that.onShortcutEvent(id); } );
      }
      catch (e) { debug.exception(e); }
    };

    ctor.prototype.onShortcutEvent = function (aId)
    {
      switch (aId) {
      case "view-trans-plusx":
        this._outer.translateView(1, 0, 0);
        break;
      case "view-trans-minusx":
        this._outer.translateView(-1, 0, 0);
        break;
      }
    };

    ctor.prototype.updateCurView = function ()
    {
      if (this.mCurrentView==null)
        this.mCurrentView=this.getCurrentViewW();
    }

    /////////////////////////


    ctor.prototype.makeTabLabel = function (aScID, aVwID)
    {
      var obj;

      obj = cuemol.getScene(aScID);
      var sc_name = obj.name;

      obj = cuemol.sceMgr.getView(aVwID);
      var vw_name = obj.name;

      return  sc_name+":"+vw_name;
    }

    ctor.prototype.addTab = function _addTab(aScID, aVwID)
    {
      var t = document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "tab");
      //window.alert("calling bind ("+aScID+", "+aVwID+")");

      var labeltext = this.makeTabLabel(aScID, aVwID);
      t.setAttribute("label", labeltext);
      t.setAttribute("tooltiptext", labeltext);
      t.setAttribute("crop", "end");
      t.setAttribute("flex", "1");
      // t.setAttribute("validate", "never");
      t.className = "tabmolview-tab";
      this._outer.mTabContainer.appendChild(t);
      t.setImpl(this);

      //window.alert("calling bind ("+aScID+", "+aVwID+")");

      var molview;
      var mvid = "render-widget-"+aScID+"-"+aVwID;
      if (this._outer.mUsePlugin) {
        molview = document.createElementNS("http://www.w3.org/1999/xhtml", "embed");
        molview.setAttribute("type", "application/cuemol2-plugin");
        dd("created plugin molview id="+mvid);
      }
      else {
        //molview = document.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
        molview = document.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
          "iframe");
        dd("created iframe molview id="+mvid);
      }

      //molview.setAttribute("style", "margin: 0px; padding: 0px; border: 0px; background-color: black;");
      molview.setAttribute("style", "margin: 0px; padding: 0px; border: 0px; -moz-user-focus: normal;");
      molview.setAttribute("flex", "1");
      molview.setAttribute("id", mvid);
      molview.setAttribute("scid", aScID);
      molview.setAttribute("vwid", aVwID);
      //molview.setAttribute("hidden", true);
      //molview.setAttribute("tooltip", "tabmolview-tooltip");

      //window.alert("calling bind ("+aScID+", "+aVwID+")");
      this._outer.mPanelContainer.appendChild(molview);

      t.natwin = nwmgr.setup(window, molview, aScID, aVwID);

      t.linkedView = molview;
      t.linkedSceneID = aScID;
      t.linkedViewID = aVwID;

      let position = this._outer.mTabs.length - 1;
      t._tPos = position;

      // Select the added tab
      this._outer.selectedTab = t;
      this.mActiveViewID = aVwID;
      var view = cuemol.getView(aVwID);
      view.active = true;
      view = null;

      var that = this;

      //molview.removeAttribute("hidden");

      //  setTimeout( function() { natwin.load(); }, 0);
      //  evtarg.addEventListener("mouseover", function(){dump("***mouseover\n");}, false);
      dd("BindIframe: OK");

      // Update HW stereo menu
      this.updateHwStereoMenu();

      return t;
    }

    ctor.prototype.removeTab = function _removeTab(aTab)
    {
      var l = this._outer.mTabContainer.childNodes.length;
      if (l==1) return;

      var index = -1;
      if (this._outer.selectedTab == aTab)
        index = this._outer.mTabContainer.selectedIndex;
      else {
        // Find and locate the tab in our list.
        for (var i = 0; i < l; i++)
          if (this._outer.mTabContainer.childNodes[i] == aTab)
            index = i;
      }

      //
      // cleanup molview
      //

      //if ("unbind" in aTab.linkedView) {
      //// unbind from the view
      //aTab.linkedView.unbind();
      //}

      // Dereference the native widget (XPCNativeWidget instance)
      if ("natwin" in aTab) {
        dd("Removing XPCNativeWidget obj: "+aTab.natwin);
        // aTab.natwin.unload();
        nwmgr.finalize(aTab.natwin);
        delete aTab.natwin;
      }

      var scene = this.getCurrentSceneW();

      // destroy the view
      scene.destroyView(aTab.linkedViewID);

      var nViewCnt = scene.getViewCount();
      if (nViewCnt==0) {
        // remove the scene
        cuemol.sceMgr.destroyScene(aTab.linkedSceneID);
      }

      //
      // cleanup UI
      //
      var currentIndex = this._outer.mTabContainer.selectedIndex;

      var oldTab = aTab;
      oldTab._selected = false;

      // Remove the tab
      this._outer.mTabContainer.removeChild(aTab);
      this._outer.mPanelContainer.removeChild(aTab.linkedView);

      // Find the tab to select
      var newIndex = -1;
      if (currentIndex > index)
        newIndex = currentIndex-1;
      else if (currentIndex < index)
        newIndex = currentIndex;
      else {
        newIndex = (index == l - 1) ? index - 1 : index;
      }

      // Select the new tab
      this.selectTab(newIndex);
      //this._outer.selectedTab = this._outer.mTabContainer.childNodes[newIndex];
      //this._outer.mTabBox.selectedPanel = this._outer.selectedTab.linkedView;
    }

    ctor.prototype.removeAllTabs = function _tabmolview_removeAllTabs()
    {
      var childNodes = this._outer.mTabContainer.childNodes;
      var i, nTabs = childNodes.length;
      for (i=0; i<nTabs; ++i) {
        var tab = childNodes[i];
        try {
          // if (!("linkedSceneID" in tab)) continue; // not a tab instance!!
          var scene = cuemol.sceMgr.getScene(tab.linkedSceneID);
          scene.destroyView(tab.linkedViewID);
          var nViewCnt = scene.getViewCount();
          if (nViewCnt==0) {
            // remove the empty scene
            cuemol.sceMgr.destroyScene(tab.linkedSceneID);
          }

          // Dereference the native widget (XPCNativeWidget instance)
          if ("natwin" in tab) {
            //tab.natwin.unload();
            nwmgr.finalize(tab.natwin);
            delete tab.natwin;
          }

          this._outer.mTabContainer.removeChild(tab);
          this._outer.mPanelContainer.removeChild(tab.linkedView);
        }
        catch (e) {
          dd("Warning: tabmolview removeAllTabs, non-tab element at: "+i);
          debug.exception(e);
        }
      }
    };

    ctor.prototype.moveTabTo = function (aTab, aIndex)
    {
      var oldPosition = aTab._tPos;
      if (oldPosition == aIndex)
        return;

      // let wasFocused = (document.activeElement == this.mCurrentTab);

      aIndex = aIndex < aTab._tPos ? aIndex: aIndex+1;
      // this.mCurrentTab._selected = false;
      
      // use .item() instead of [] because dragging to the end of the strip goes out of
      // bounds: .item() returns null (so it acts like appendChild), but [] throws
      this._outer.mTabContainer.insertBefore(aTab, this._outer.mTabs.item(aIndex));
      this._outer.mPanelContainer.insertBefore(aTab.linkedView,
                                               this._outer.mPanelContainer.childNodes.item(aIndex));
      
      // re-setup event handler for molview's iframe (for resize, wheel, evts etc)
      nwmgr.resetup(window, aTab.linkedView);

      // update tabs' properties (tPos, etc)
      for (let i = 0; i < this._outer.mTabs.length; i++) {
        this._outer.mTabs[i]._tPos = i;
        // this._outer.mTabs[i]._selected = false;
      }

      //this.mCurrentTab._selected = true;
      // if (wasFocused)
      // this.mCurrentTab.focus();

    };
    
    ctor.prototype.selectTab = function (aIndex)
    {
      this._outer.selectedTab = this._outer.mTabContainer.childNodes[aIndex];
      this._outer.mTabBox.selectedPanel = this._outer.selectedTab.linkedView;
    }

    ctor.prototype.updateTabLabel = function (aTab)
    {
      var label = this.makeTabLabel(aTab.linkedSceneID, aTab.linkedViewID);
      aTab.setAttribute("label", label);
      aTab.setAttribute("tooltiptext", label);
    }

    ctor.prototype.getCurrentSceneW = function ()
    {
      if (!this._outer.selectedTab) {
        dump("getCurrSce(): no view\n");
        return null;
      }
      var scid = this._outer.selectedTab.linkedSceneID;
      if (!scid) {
        dump("getCurrSce(): scene ID is NULL\n");
        return null;
      }
      return cuemol.sceMgr.getScene(scid);
    }

    ctor.prototype.getCurrentViewW = function ()
    {
      var vwid = this._outer.selectedTab.linkedViewID;
      //dump("**** getCurrVw() vwID="+vwid+"\n");
      if (!vwid) {
        dump("getCurrVw(): vw ID is NULL\n");
        return null;
      }
      //var scene = this.getCurrentSceneW();
      //if (!scene)
      //return null;
      return cuemol.getView(vwid);
    }

    ctor.prototype.onScenePropChanged = function (args)
    {
      dd("TABMOLVIEW: onScenePropChnged, "+args.obj.propname);

      if ("propname" in args.obj && (
        args.obj.propname=="name")) {

        var childNodes = this._outer.mTabContainer.childNodes;
        var i, nTabs = childNodes.length;
        for (i=0; i<nTabs; ++i) {
          var tab = childNodes[i];

          if (tab.linkedSceneID!=args.srcUID)
            continue;

          this.updateTabLabel(tab);
        }

      }
    }

    /// Tab selection changed event handler
    ctor.prototype.onTabSelect = function (aEvent)
    {
      dd("====================");
      dd("== onTabSelect called, selected="+this._outer.mPanelContainer.selectedPanel);

      if (this.mCurrentFrm && this.mCurrentFrm.native_window)
        this.mCurrentFrm.native_window.hide();

      this.mCurrentFrm = this._outer.mPanelContainer.selectedPanel;
      if (this.mCurrentFrm.native_window)
        this.mCurrentFrm.native_window.show();

      // Invalidate cached view/scene object
      this.mCurrentScene = null;
      this.mCurrentView = null;

      var view = this.getCurrentViewW();

      // Change the active view
      if (this.mActiveViewID) {
        var old_view = cuemol.getView(this.mActiveViewID);
        if (old_view)
          old_view.active = false;
      }
      view.active = true;

      //view = null;

      this.updateHwStereoMenu();
    }

    /// Menu update functions (HW stereo)
    ctor.prototype.updateHwStereoMenu = function ()
    {
      dd("TabMoView> updateHwStereoMenu()");
      var view = this.getCurrentViewW();

      var cmd = document.getElementById("cmd_toggle_hwstereo");
      var hwster = view.hasHWStereo;

      if (!hwster)
        cmd.setAttribute("disabled", "true");
      else
        cmd.removeAttribute("disabled");

      var hwstereo_menu = document.getElementById("view-menu-hwstereo");
      var smode = view.stereoMode;
      dd("OnTabASelect> Stereo mode: "+smode);
      if (smode=="hardware")
        hwstereo_menu.setAttribute("checked", "true");
      else
        hwstereo_menu.removeAttribute("checked");

      //view = null;
    }

    ctor.prototype.onMouse = function (aEvent)
    {
      dd("***onMouse type="+aEvent.type+", target="+aEvent.target);
      var that = this;

      switch (aEvent.type) {
      case "mousemove":
        this.setCursor("auto");
        if (this.mToolTip)
          this.mToolTip.hidePopup();
        if (this.mHoverTimeoutID)
          window.clearTimeout(this.mHoverTimeoutID);

        this.mHoverTimeoutID = window.setTimeout(
          function (e) { that.onHover(e); }, this.mHoverDelay, aEvent);
        break;

      case "mouseout":
        this.setCursor("auto");
        if (this.mToolTip)
          this.mToolTip.hidePopup();
        if (this.mHoverTimeoutID)
          window.clearTimeout(this.mHoverTimeoutID);
        break;
      }

    }

    ctor.prototype.onHover = function (aEvent)
    {
      var x = aEvent.clientX;
      var y = aEvent.clientY;
      dd("** HOVER ** "+x+", "+y);

      var view = this.getCurrentViewW();
      var sres;
      try {
        sres = view.hitTest(x, y);
        dump("Hittest result: "+sres+"\n");
      }
      catch(e) {
        debug.exception(e);
        return;
      }

      if (sres.length==0) return;

      var res;
      try {
        res = JSON.parse(sres);
      }
      catch (e) {
        dd("error : "+sres);
        debug.exception(e);
        return;
      }

      if (cuemol.implIface(res.objtype, "MolCoord")) {
        var label = "Molecule ["+res.obj_name+"], "+res.data[0].message;

        // dd("set status line: "+label);
        // dd("status line: "+gQm2Main.mStatusLabel);
        // gQm2Main.mStatusLabel.label = label;

        var molview = this._outer.mPanelContainer.selectedPanel;
        if (this.mToolTip) {
          this.mToolTip.label = label;
          this.mToolTip.openPopup(molview, "overlap", x, y);
        }
        this.setCursor("pointer");
      }
    }

    ctor.prototype.setCursor = function (aCursor)
    {
      var molview = this._outer.mPanelContainer.selectedPanel;
      if (molview)
        molview.contentWindow.setCursor(aCursor);
    }

    ctor.prototype.getTabByViewId = function (viewid)
    {
      var childNodes = this._outer.mTabContainer.childNodes;
      var i, nTabs = childNodes.length;
      for (i=0; i<nTabs; ++i) {
        var tab = childNodes[i];
        if (tab.linkedViewID==viewid)
          return tab;
      }

      // not found
      return null;
    }

    ctor.prototype.populateAllTabMenu = function (aEvent)
    {
      var menu = aEvent.currentTarget;
      dd("PopulateAllTabMenu: "+menu.id);

      while (menu.firstChild)
        menu.removeChild(menu.firstChild);

      var childNodes = this._outer.mTabContainer.childNodes;
      var i, nTabs = childNodes.length;
      for (i=0; i<nTabs; ++i) {
        var tab = childNodes[i];
        var item = util.appendMenu(document, menu, i, tab.label);
        item.setAttribute("type", "checkbox");
        if (tab==this._outer.selectedTab) {
          dd("============= tab selected: "+tab.label);
          item.setAttribute("checked", true);
        }
      }

    }

    ctor.prototype.onCmdTabMenu = function (aEvent)
    {
      //dd("selecteed: "+aEvent.target.value);
      var newIndex = parseInt(aEvent.target.value);
      if (newIndex===NaN)
        return;
      this.selectTab(newIndex);
    }

    return ctor;

  } )();

  //////////////////////////////
  //  Tabs

  cuemolui.MolViewTabs = ( function() {

    const TAB_DROP_TYPE = "application/x-tabmolview-tab";

    // constructor
    var ctor = function (aOuter)
    {
      this._outer = aOuter;
    };
    
    ctor.prototype._getDragTargetTab = function (event)
    {
      let tab = event.target.localName == "tab" ? event.target : null;
      /*if (tab &&
          (event.type == "drop" || event.type == "dragover") &&
          event.dataTransfer.dropEffect == "link") {
        let boxObject = tab.boxObject;
        if (event.screenX < boxObject.screenX + boxObject.width * .25 ||
            event.screenX > boxObject.screenX + boxObject.width * .75)
          return null;
      }*/
      return tab;
    };
    
    ctor.prototype._getDropIndex = function(event)
    {
      var tabs = this._outer.childNodes;
      var tab = this._getDragTargetTab(event);
      for (let i = tab ? tab._tPos : 0; i < tabs.length; i++)
        if (event.screenX < tabs[i].boxObject.screenX + tabs[i].boxObject.width / 2)
          return i;
      return tabs.length;
    };

    ctor.prototype._setEffectAllowedForDataTransfer = function (event)
    {
      var dt = event.dataTransfer;
      // Disallow dropping multiple items
      if (dt.mozItemCount > 1)
        return dt.effectAllowed = "none";

      var types = dt.mozTypesAt(0);
      var sourceNode = null;
      // tabs are always added as the first type
      if (types[0] == TAB_DROP_TYPE) {
        var sourceNode = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
        dd("source local name = "+sourceNode.localName);
        if (sourceNode instanceof XULElement &&
            sourceNode.localName == "tab") {
          /*&&
            sourceNode.ownerDocument.defaultView instanceof ChromeWindow &&
            sourceNode.ownerDocument.documentElement.getAttribute("windowtype") == "navigator:browser" &&
            sourceNode.ownerDocument.defaultView.gBrowser.tabContainer == sourceNode.parentNode) {
            */
          
          /*// Do not allow transfering a private tab to a non-private window
          // and vice versa.
          if (PrivateBrowsingUtils.isWindowPrivate(window) !=
              PrivateBrowsingUtils.isWindowPrivate(sourceNode.ownerDocument.defaultView))
            return dt.effectAllowed = "none";
          */
#ifdef XP_MACOSX
          return dt.effectAllowed = event.altKey ? "copy" : "move";
#else
          return dt.effectAllowed = event.ctrlKey ? "copy" : "move";
#endif
        }
      }
      
      /*if (browserDragAndDrop.canDropLink(event)) {
        // Here we need to do this manually
        return dt.effectAllowed = dt.dropEffect = "link";
      }*/
      return dt.effectAllowed = "none";
    };

    ctor.prototype.onDragStart = function (event)
    {
      dd("Tab dragStart");
      //dd(debug.dumpObjectTree(event.target));
      
      let tab = this._getDragTargetTab(event);
      if (!tab)
        return;

      let dt = event.dataTransfer;
      dt.mozSetDataAt(TAB_DROP_TYPE, tab, 0);
      
      event.stopPropagation();
    };

    ctor.prototype.onDragOver = function (event)
    {

      var effects = this._setEffectAllowedForDataTransfer(event);
      var dt = event.dataTransfer;

      dd("Tab dragOver eff="+effects);
      dd("Tab dragOver evttgt="+event.target.label);
      
      var ind = this._outer._tabDropIndicator;
      if (effects == "" || effects == "none") {
        ind.collapsed = true;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      
      // calc drop indicator location
      let tabStrip = this._outer.mTabstrip;
      let rect = tabStrip.getBoundingClientRect();
      let newMargin;

      let newIndex = this._getDropIndex(event);
      dd("dragOver -- newind = "+newIndex);
      
      if (effects == "move") {
        let tgttab = event.dataTransfer.mozGetDataAt(TAB_DROP_TYPE, 0);
        dd("dragOver -- tgt index = "+tgttab._tPos);
        
        if (tgttab._tPos==newIndex || tgttab._tPos+1==newIndex) {
          ind.collapsed = true;
          // this._animateTabMove(event);
          dd("dragOver -- self => prevent");
          return;
        }
      }
      
      if (newIndex == this._outer.childNodes.length) {
        let tabRect = this._outer.childNodes[newIndex-1].getBoundingClientRect();
        newMargin = tabRect.right - rect.left;
      }
      else {
        let tabRect = this._outer.childNodes[newIndex].getBoundingClientRect();
        newMargin = tabRect.left - rect.left;
      }
      
      ind.collapsed = false;
      newMargin += ind.clientWidth / 2;

      ind.style.transform = "translate(" + Math.round(newMargin) + "px)";
      ind.style.MozMarginStart = (-ind.clientWidth) + "px";
    };

    ctor.prototype.onDrop = function (event)
    {
      dd("Tab drop");
      
      var dt = event.dataTransfer;
      var dropEffect = dt.dropEffect;
      var draggedTab;

      draggedTab = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
      // not our drop then
      if (!draggedTab)
        return;
      
      this._outer._tabDropIndicator.collapsed = true;
      event.stopPropagation();

      // perform Drop
      let newIndex = this._getDropIndex(event);
      if (dropEffect == "copy") {
        // copy (create a second view) the dropped tab
        /*
        let newTab = this.tabbrowser.duplicateTab(draggedTab);
        this.tabbrowser.moveTabTo(newTab, newIndex);
        if (draggedTab.parentNode != this || event.shiftKey)
          this.selectedItem = newTab;
         */
      }
      else {
        // move the dragged tab
        if (newIndex > draggedTab._tPos)
          newIndex--;
        let tabmolview = this._outer.parentNode.parentNode.parentNode;
        dd("tabmolview: "+tabmolview.localName);
        tabmolview.moveTabTo(draggedTab, newIndex);
      }

    };

    ctor.prototype.onDragEnd = function (event)
    {
      dd("Tab drag end");
    };
    
    ctor.prototype.onDragExit = function (event)
    {
      dd("Tab drag exit");
      this._outer._tabDropIndicator.collapsed = true;
      event.stopPropagation();
    };

    return ctor;

  } )();

}

