// -*-Mode: C++;-*-
//
// selection-panel.js: mol selection sidepanel implementation
//
// $Id: selection-panel.js,v 1.7 2011/02/19 08:43:13 rishitani Exp $
//

if (!("selection" in cuemolui.panels)) {

  ( function () {
    
    // var util = require("util");
    var panel = cuemolui.panels.selection = new Object();

    // panel's ID
    panel.id = "selection-panel";

    panel.collapsed = false;

    // main menu's ID
    panel.command_id = "menu-selection-panel-toggle";

    panel.mSelector = new cuemolui.ObjMenuList(
      "selection-mol-selector",
      window,
      function (elem) {
        return cuemol.implIface(elem.type, "MolCoord");
      },
      cuemol.evtMgr.SEM_OBJECT);

    window.addEventListener("load", function(){panel.onLoad();}, false);
    //alert('YYY');
    window.addEventListener("unload", function() {panel.onUnLoad();}, false);

    //////////////////////////
    // event handlers

    panel.onLoad = function ()
    {
      this.onLoadCommandPanel();
      this.onLoadEditPanel();
    }

    panel.onUnLoad = function ()
    {
    }

    //////////////////////////
    // Editor tabpanel

    panel.onLoadEditPanel = function ()
    {
      var that = this;
      this.mEditListBox = document.getElementById("select-editor-list");
      this.mEditAddBtn = document.getElementById("selectPanelEditAddBtn");
      this.mEditDelBtn = document.getElementById("selectPanelEditDelBtn");
      //this.mCmdBtnClTxt = document.getElementById("selectPanelCmdClTxtBtn");
      this.mEditClrBtn = document.getElementById("selectPanelEditClrBtn");
      this.mEditSelBtn = document.getElementById("selectPanelEditSelectBtn");

      this.mEditListBox.addEventListener("select", function(e) { that.onEditListSelChg(e); }, false);

      this.mEditAddBtn.addEventListener("command", function(e) { that.onEditAddBtn(e); }, false);
      this.mEditDelBtn.addEventListener("command", function(e) { that.onEditDelBtn(e); }, false);
      this.mEditClrBtn.addEventListener("command", function(e) { that.onEditClrBtn(e); }, false);
      this.mEditSelBtn.addEventListener("command", function(e) { that.onEditSelBtn(e); }, false);
    }

    panel.onEditListSelChg = function (event)
    {
      var sel = this.mEditListBox.selectedIndex;
      var ic = this.mEditListBox.itemCount;
      dd("OnEditListSel, Selected item: "+sel);

      var mol = this.mSelector.getSelectedObj();
      dd("OnEditListSel, mol: "+mol);
      if (mol==null || sel<0) {
        dd("OnEditListSel, mol is null");
        this.mEditSelBtn.setAttribute("disabled", "true");
      }
      else {
        this.mEditSelBtn.removeAttribute("disabled");
      }

      if (sel<0) {
        this.mEditDelBtn.setAttribute("disabled", "true");
        this.mEditClrBtn.setAttribute("disabled", "true");
      }
      else {
        this.mEditDelBtn.removeAttribute("disabled");
        this.mEditClrBtn.removeAttribute("disabled");
      }

      if (ic==0) {
        document.getElementById("selectPanelEditAdd-arnd").setAttribute("disabled", "true");
      }
      else {
        document.getElementById("selectPanelEditAdd-arnd").removeAttribute("disabled");
      }
    }

    panel.onEditAddBtn = function (event)
    {
      var tg = event.target.id;
      dd("Add: "+tg);

      var ic = this.mEditListBox.itemCount;

      var newnode =
        document.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
          "richlistitem");
      switch (tg) {
      case "selectPanelEditAdd-hier":
        newnode.className = "molselitem-hier";
        break;
      case "selectPanelEditAdd-term":
        newnode.className = "molselitem-term";
        break;
      case "selectPanelEditAdd-arnd":
        if (ic==0) {
          dd("ERROR: cannot add singleton around node!!");
          return;
        }
        newnode.className = "molselitem-around";
        break;
      }

      if (ic==0) {
        newnode.setAttribute("noop", "true");
        this.mEditListBox.appendChild(newnode);
        return;
      }

      var ib = this.mEditListBox.selectedItem.nextSibling;
      dd("insertbefore="+ib);
      this.mEditListBox.insertBefore(newnode, ib);
    }

    panel.onEditDelBtn = function (event)
    {
      var sel = this.mEditListBox.selectedIndex;
      dd("Selected target: "+event.originalTarget.id);
      dd("Selected item: "+sel);

      if (sel<0) {
        dd("No selected item.");
        return;
      }

      this.mEditListBox.removeItemAt(sel);

      var last = this.mEditListBox.itemCount-1;
      dd("Last = "+last);
      this.mEditListBox.selectedIndex = sel>last?last:sel;
      //event.preventDefault();

      if (this.mEditListBox.firstChild.getAttribute("class")=="molselitem-around")
        this.mEditListBox.removeItemAt(0);
      else
        this.mEditListBox.firstChild.setAttribute("noop", "true");
    }

    panel.onEditClrBtn = function (event)
    {
      while (this.mEditListBox.itemCount>0) {
        this.mEditListBox.removeItemAt(0);
      }
    }

    panel.onEditSelBtn = function (event)
    {
      var mol = this.mSelector.getSelectedObj();
      if (mol==null) {
        dd("selpanel> no mol");
        return;
      }

      var ic = this.mEditListBox.itemCount;
      if (ic==0) {
        dd("selpanel> no selection");
        return;
      }

      var selstr="";
      for (var i=0; i<ic; ++i) {
        var elem = this.mEditListBox.getItemAtIndex(i);
        var cls = elem.getAttribute("class");
        dd("class="+cls);
        switch (cls) {
        case "molselitem-hier":
          selstr = this.compSelItemHier(elem, selstr);
          break;
        case "molselitem-term":
          selstr = this.compSelItemTerm(elem, selstr);
          break;
        case "molselitem-around":
          selstr = this.compSelItemAround(elem, selstr);
          break;
        }
      }

      dd("selstr: "+selstr);
      this.performSel(mol, selstr);
    }

    panel.compSelItemHier = function (elem, selstr)
    {
      var op = elem.boolop;
      var term = elem.chainName +"."+ elem.residIndex +"."+ elem.atomName;
      if (op==null || selstr.length==0)
        return term;
      else
        return selstr+" "+op+" "+term;
    }

    panel.compSelItemTerm = function (elem, selstr)
    {
      var op = elem.boolop;
      var term = elem.commandName + " " + elem.commandArgs;

      dd("teerm selst:"+selstr.length);
      dd("teerm op:"+op);
      if (op==null || selstr.length==0)
        return term;
      else
        return selstr+" "+op+" "+term;
    }

    panel.compSelItemAround = function (elem, selstr)
    {
      var cmd = elem.commandName;
      var term;
      if (cmd=="around" || cmd=="expand") {
        term = cmd +" "+ elem.commandArgs;
        return "("+selstr+") "+term;
      }
      else if (cmd=="around byres") {
        term = "around "+ elem.commandArgs;
        return "byres (("+selstr+") "+term+")";
      }
      else if (cmd=="extend byres") {
        term = "extend "+ elem.commandArgs;
        return "byres (("+selstr+") "+term+")";
      }

      return null;
    }

    function _appendMenuItem(aElem, aLabel) {
      var item = document.createElement("menuitem");
      item.setAttribute("label", aLabel)
        aElem.appendChild(item);
      return item;
    }

    panel.populateChainList = function (aElem, aList)
    {
      dd("populateChainList: "+aElem);

      //while (aElem.firstChild)
      //aElem.removeChild(aElem.firstChild);
      // _appendMenuItem(aElem, "*");

      var mol = this.mSelector.getSelectedObj();
      if (mol==null) {
        dd("selpanel> no mol");
        _appendMenuItem(aElem, "A");
        _appendMenuItem(aElem, "B");
        _appendMenuItem(aElem, "C");
        return;
      }

      try {
        var list = JSON.parse(mol.getChainNameCandsJSON());
        list.forEach( function (i) {
          _appendMenuItem(aElem, i);
        });
      }
      catch (e) {
        debug.exception(e);
        return;
      }

    }

    panel.populateAnameList = function (aElem)
    {
      dd("populateAnameList: "+aElem);

      //while (aElem.firstChild)
      //aElem.removeChild(aElem.firstChild);
      //_appendMenuItem(aElem, "*");

      var mol = this.mSelector.getSelectedObj();
      if (mol==null) {
        dd("selpanel> no mol");
        _appendMenuItem(aElem, "CA");
        _appendMenuItem(aElem, "CB");
        _appendMenuItem(aElem, "CG");
        return;
      }

      try {
        var list = JSON.parse(mol.getAtomNameCandsJSON());
        list.forEach( function (i) {
          _appendMenuItem(aElem, i);
        });
      }
      catch (e) {
        debug.exception(e);
        return;
      }
    }

    panel.populateElemList = function (aElem, aList)
    {
      dd("populateAnameList: "+aElem);

      //while (aElem.firstChild)
      //aElem.removeChild(aElem.firstChild);
      //_appendMenuItem(aElem, "*");

      var mol = this.mSelector.getSelectedObj();
      if (mol==null) {
        dd("selpanel> no mol");
        _appendMenuItem(aElem, "C");
        _appendMenuItem(aElem, "N");
        _appendMenuItem(aElem, "O");
        _appendMenuItem(aElem, "S");
        return;
      }

      try {
        var list = JSON.parse(mol.getElemNameCandsJSON());
        list.forEach( function (i) {
          _appendMenuItem(aElem, i);
        });
      }
      catch (e) {
        debug.exception(e);
        return;
      }

      aElem.selectedIndex = 0;
    }

    panel.populateResnList = function (aElem)
    {
      //while (aElem.firstChild)
      //aElem.removeChild(aElem.firstChild);
      //_appendMenuItem(aElem, "*");

      var mol = this.mSelector.getSelectedObj();
      if (mol==null) {
        dd("selpanel> no mol");
        return;
      }

      try {
        var list = JSON.parse(mol.getResidNameCandsJSON());
        list.forEach( function (i) {
          _appendMenuItem(aElem, i);
        });
      }
      catch (e) {
        debug.exception(e);
        return;
      }
    }

    //////////////////////////
    // Command tabpanel

    panel.onLoadCommandPanel = function ()
    {
      var that = this;

      this.mCmdCmdInput = document.getElementById("select-command-input");
      this.mCmdBtnSel = document.getElementById("selectPanelCmdSelectBtn");
      //this.mCmdBtnClTxt = document.getElementById("selectPanelCmdClTxtBtn");

      this.mCmdHistBtn = document.getElementById("selectPanelHistBtn");
      this.mCmdHistPup = document.getElementById("selectPanelHistPopup");

      this.mCmdBtnSel.addEventListener("command",
                                       function(e) { that.onCmdBtnSel(); },
                                       false);
      this.mCmdHistBtn.addEventListener("command",
                                        function(e) { that.onHistPup(e); },
                                        false);
      this.mCmdHistPup.addEventListener("popupshowing",
                                        function(e) { that.onHistPupShow(e); },
                                        false);
    };

    panel.onHistPup = function (aEvent)
    {
      var menu_val = aEvent.target.value;
      dd("HistMenuCmd: "+menu_val);
      this.mCmdCmdInput.value = menu_val;
    };

    panel.onHistPupShow = function (aEvent)
    {
      var menu = aEvent.currentTarget;
      dd("PopulateHistMenu: "+menu.id);

      util.clearMenu(menu);
      var selstr;
      var his = util.selHistory;
      var nitems = his.getLength();
      if (nitems>0) {
        for (var i=0; i<nitems; ++i) {
          selstr = his.getEntry(i);
          util.appendMenu(document, menu, selstr, selstr);
          // element.appendItem(his.getEntry(i), his.getEntry(i));
        }
      }
      else {
        let item = util.appendMenu(document, menu, null, "(no history)");
        item.setAttribute("disabled", true);
      }

    };

    panel.onCmdBtnSel = function ()
    {
      var mol = this.mSelector.getSelectedObj();
      if (mol==null) {
        dd("selpanel> no mol");
        return;
      }

      var cmd = this.mCmdCmdInput.value;
      dd("select cmd="+cmd);

      this.performSel(mol, cmd);
    }

    panel.performSel = function (mol, cmd)
    {
      var scene = mol.getScene();

      var sel=null
        try {
          sel = cuemol.makeSel(cmd, scene.uid);
        }
      catch (e) {
        debug.exception(e);
      }

      if (sel==null) {
        util.alert(window, "Invalid command:" + cmd);
        this.mCmdCmdInput.setSelectionRange(0, this.mCmdCmdInput.textLength);
        return;
      }

      cuemolui.chgMolSelObj(mol, sel, "Change mol selection", true);

      /*
      // EDIT TXN START //
      scene.startUndoTxn("Change mol selection");
      try {
        mol.sel = sel;
      }
      catch(e) {
        dd("SetProp error");
        debug.exception(e);
        scene.rollbackUndoTxn();
        return;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //

      // Save to selHistory
      util.selHistory.append(cmd);
        */
    }

  } )();

}

