// -*-Mode: C++;-*-
//
// propeditor-generic-page.js
//  Generic Property Editor page
//
// $Id: propeditor-generic-page.js,v 1.16 2011/05/01 09:28:03 rishitani Exp $
//

if (!("GenPropEdit" in cuemolui)) {

cuemolui.GenPropEdit = ( function () {

//////////////////////////////////////////////////////////////////
// TreeView Implementation

var TreeViewImplCtor = function (aParent)
{
  this.treebox = null;
  this.selection = null;
  this.rowCount = 0;
  this.mParent = aParent;
} 

var TreeViewImpl = TreeViewImplCtor.prototype;

// dlg.mTreeView = new Object();

TreeViewImpl.setTree = function(treebox)
{
  this.treebox = treebox;
}

TreeViewImpl.getCellText = function (row,column)
{
  //dump("row="+row+", col="+column.id+"\n");
  if (column.id == "objprop-key") {
    return this.mParent.mVisibleData[row].name;
  }
  else if (column.id == "objprop-type") {
    return this.mParent.mVisibleData[row].type;
  }
  else if (column.id == "objprop-value") {
    return this.mParent.mVisibleData[row].value;
  }
  else if (column.id == "objprop-readonly") {
    return (this.mParent.mVisibleData[row].readonly)?"R":" ";
  }
}

TreeViewImpl.setCellText = function (row,column,value)
{
}

TreeViewImpl.isEditable = function (row,col)
{
  /*
  if (col.id != "objprop-value") return false;  

  if (this.mParent.mVisibleData[row].type=="string")
    return true;  
  if (this.mParent.mVisibleData[row].type=="integer")    
    return true;  
  if (this.mParent.mVisibleData[row].type=="real")    
    return true;  
  if (this.mParent.mVisibleData[row].type=="boolean")    
    return true;  
*/    
  return false;
}

TreeViewImpl.cycleHeader = function (col, elem) {}

TreeViewImpl.isContainer = function (row)
{
  return false;
}

TreeViewImpl.isContainerOpen = function (row)
{
  return false;
}

TreeViewImpl.isContainerEmpty = function (row)
{
  return true;
}

TreeViewImpl.getParentIndex = function (row)
{
  return this.mParent.mVisibleData[row].parent;
}

TreeViewImpl.hasNextSibling = function (rowIndex, afterIndex)
{
  return true;
}

TreeViewImpl.getLevel = function (row)
{
  return 0;
}

//TreeViewImpl.performActionOnCell: function(action, row, col) {
//dump("action performed: "+action+", "+row+", "+col+"\n");
//},

TreeViewImpl.isSeparator = function (row) { return false; }
TreeViewImpl.isSorted = function () { return false; }
TreeViewImpl.getImageSrc = function (row,col) { return null; }
TreeViewImpl.getRowProperties = function (row,props) {}
TreeViewImpl.getCellProperties = function (row,col,props) {}
TreeViewImpl.getColumnProperties = function (colid,col,props) {}
TreeViewImpl.toggleOpenState = function (row) {}

//////////////////////////////////////////////////////////////////
// PropDlg & Generic Property Editor Page Implementation

const pref = require("preferences-service");

var ctor = function ()
{
  dd("GenPropEdit.ctor> Called"); 
  var that = this;
  addEventListener("load", function() {
    try { that.onLoad(); } catch (e) { debug.exception(e); }
  }, false);
  addEventListener("unload", function() {that.onUnload();}, false);
  
  this.mTreeView = new TreeViewImplCtor(this);
  
  var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 
  this.mTgtObj = args.target;
  this.mTgtObjID = this.mTgtObj.uid;
  this.mTgtSce = args.scene;
  this.mTgtSceID = this.mTgtSce.uid;

  // this.mTabUpdater = new Object();
  this.mTabs = new Object();
  this.mCurTabId = null;

  this.mObjData = null;

  // dd("GenPropEdit.ctor> Target obj=["+this.mTgtObjID+"]");
}

var klass = ctor.prototype;

klass.onLoad = function ()
{
  dd("GenPropEdit.onLoad> Called"); 

  // apply button (initially disabled)
  this.mApplyBtn = document.documentElement.getButton("extra2");
  if (this.mApplyBtn)
    this.mApplyBtn.disabled = true;

  this.mCancelBtn = document.documentElement.getButton("cancel");
  this.mCancelBtn.disabled = false;

  ( function () {
    dd("GenPropEdit.onLoad> TABS=" + this.mTabs); 
    for (var i in this.mTabs) {
      dd("call onload : "+i);
      this.notifyTab("onLoad", i);
    }
  } ).call(this);

  var that = this;

  this.mColPicker = document.getElementById("colorPickerPanel");
  this.mColPicker.setTargetSceneID(this.mTgtSceID);
  this.mColPicker.setParentUpdate(function(isComp) { if (isComp) that.validateChanges(); });

  var obj = this.mTgtObj;

  if (!obj) {
    window.alert("Fatal ERROR: Invalid object target="+this.mTgtObjID);
    // TO DO: abort dialog !!
    return;
  }

  this.mTree = document.getElementById("objprop-tree");
  this.mValueText = document.getElementById("value-text");
  this.mValueDeck = document.getElementById("value-deck");
  this.mValueCheck = document.getElementById("value-check");
  this.mValueEnum = document.getElementById("value-enum-list");
  this.mDefaultCheck = document.getElementById("default-check");
  this.mPropTypeText = document.getElementById("prop-type-text");
  this.mPropNameText = document.getElementById("prop-name-text");

  this.mVecEditX = document.getElementById("value-vec-x");
  this.mVecEditY = document.getElementById("value-vec-y");
  this.mVecEditZ = document.getElementById("value-vec-z");

  this.mTimeEdit = document.getElementById("value-timeval");

  // set event handlers
  //dd("*************************");
  this.mTree.addEventListener("select",
                              function (event) {
                                try {that.onTreeSelect(event) } catch (e) {debug.exception(e)}
                              },false);
  this.mDefaultCheck.addEventListener("click", function (event) { that.defaultToggleCheck(event) }, false);
  this.mValueText.addEventListener("change", function () { that.validateChanges() }, false);
  this.mValueCheck.addEventListener("click", function (event) { that.boolToggleCheck(event) }, false);
  this.mValueEnum.addEventListener("command", function () { that.validateChanges() }, false);

  this.mVecEditX.addEventListener("change", function () { that.validateChanges() }, false);
  this.mVecEditY.addEventListener("change", function () { that.validateChanges() }, false);
  this.mVecEditZ.addEventListener("change", function () { that.validateChanges() }, false);

  this.mTimeEdit.addEventListener("change", function () { that.validateChanges() }, false);

  // set tree view
  this.mTree.view = this.mTreeView;

  this.populateData(obj);

  //dd(debug.dumpObjectTree(this.mObjData, 10));
  //dd("GenPropEdit>>>>> VISIBLE = "+this.findPropData("visible").value);
  
  this.mTabbox = document.getElementById("propdlg-tabbox");
  if (this.mTabbox) {
    // dd("window="+debug.dumpObjectTree(document.documentElement));
    let winid = document.documentElement.id;
    let pfnm = winid+"-selected-tab-ind";
    // dd("pref name = "+pfnm);
    let prev_ind = 0;
    if (pref.has(pfnm)) {
      prev_ind = parseInt( pref.get(pfnm) );
      if (prev_ind<0||prev_ind>=this.mTabbox.tabs.itemCount)
        prev_ind=0;
    }
    this.mTabbox.selectedIndex = prev_ind;
  }

  // Fire initial tab-select events
  //   onActivate should be called after onLoad events,
  //   so that onActivate are called after all onLoad (and initialization) completed.
  //   setTimeout() (probably?) enables delayed invocation of onActivate methods
  var that = this;
  setTimeout(function () {
    that.mTabContainer = document.getElementById("tabs-overlay-target");
    that.mCurTabId = that.mTabContainer.selectedItem.id;
    that.notifyTab("onActivate", that.mCurTabId);
    that.mTabContainer.addEventListener("select", function (aEvent) { 
      that.onTabSelect();
    }, false);
  }, 0);
};

klass.populateData = function (obj)
{
  var json = obj._wrapped.getPropsJSON();
  // dd("GenPropEdit.populateData> jsonobj: "+json);

  this.mObjData = this.expandChildNodes(JSON.parse(json));

  this.buildVisibleData();
  this.mTreeView.treebox.rowCountChanged(0, this.mTreeView.rowCount);
  // dd("rowcnt="+this.mTreeView.rowCount);
  
  // backup the original values
  ( function (objdata) {
    for (var i=0; i<objdata.length; ++i) {
      var elem = objdata[i];
      if ('isdefault' in elem)
        elem.orig_isdefault = elem.isdefault;
      if (typeof elem.value=='object')
        arguments.callee(elem.value);

      elem.orig_value = elem.value;
    }
  } ) (this.mObjData);
};

klass.expandChildNodes = function (aObj)
{
  var rval = new Array();
  
  ( function (objdata, parname) {
    for (var i=0; i<objdata.length; ++i) {
      var elem = objdata[i];
      var newelem = new Object();

      //// Make propname in dot notation
      var dotname;
      if (parname)
        dotname = parname+"."+elem.name;
      else
        dotname = elem.name;

      if (!'value' in elem)
        dd("GenPropEdit.expChN> Error, property: "+dotname+", value is undefined!!");

      //dd("GenPropEdit.expChN> property: "+dotname+", value: <"+elem.value+">");

      //// Copy to the result array
      newelem.name = dotname;
      newelem.type = elem.type;
      newelem.readonly = elem.readonly;
      newelem.hasdefault = elem.hasdefault;
      if ('isdefault' in elem)
        newelem.isdefault = elem.isdefault;
      if ('enumdef' in elem)
        newelem.enumdef = elem.enumdef;
        
      if (typeof elem.value=='object')
        newelem.value = "<node>";
      else
        newelem.value = elem.value;
        
      rval.push(newelem);

      if (typeof elem.value=='object')
        arguments.callee(elem.value, dotname);
    }
  } ) (aObj);

  return rval;
}

klass.onUnload = function ()
{
  if (this.mTabbox) {
    let winid = document.documentElement.id;
    let pfnm = winid+"-selected-tab-ind";
    dd("set pref "+pfnm+" = "+this.mTabbox.selectedIndex);
    pref.set(pfnm, this.mTabbox.selectedIndex);
  }
  
  delete this.mTgtObj;
  delete this.mTgtSce;
  //alert("target="+this.mTgtObjID);
}

klass.onTabSelect = function ()
{
  var oldid = this.mCurTabId;
  var newid = this.mTabContainer.selectedItem.id;
  // dd("GenProp.onTabSel> "+oldid+" ==> "+newid);
  this.notifyTab("onInactivate", oldid);
  this.mCurTabId = newid;
  this.notifyTab("onActivate", newid);
}

klass.notifyTab = function (aFuncName, aTabId)
{
  dd("notifyTab> func="+aFuncName+", tab="+aTabId);
  try {
    if (!aTabId in this.mTabs ||
        typeof this.mTabs[aTabId] != 'object')
      return;
    var tab = this.mTabs[aTabId];
    if (aFuncName in tab && typeof tab[aFuncName] == 'function')
      tab[aFuncName].call(tab);
  }
  catch (e) {
    debug.exception(e);
  }
}

klass.onTreeSelect = function(aEvent)
{
  this.validateChanges();
  var row = aEvent.currentTarget.currentIndex;
  var elem = this.mVisibleData[row];
  if (!elem) {
    dd("GenPropEdit> Invalid tree selection: " +aEvent.currentTarget.currentIndex);
    return;
  }

  var value = elem.value;
  // dd("tree selected: " +aEvent.currentTarget.currentIndex+ ", value = "+value);

  this.mEditTgtRow = row;
  this.mPropNameText.value = elem.name;
  this.mPropTypeText.value = elem.type;
  this.mValueText.readOnly = elem.readonly;

  // default value handling
  this.mDefaultCheck.disabled = !elem.hasdefault;
  if (elem.hasdefault)
    this.mDefaultCheck.checked = elem.isdefault;

  if (elem.type=="string"||
      elem.type=="real"||
      elem.type=="integer"||
      elem.type=="object<MolSelection>"||
      elem.type=="object<Matrix>") {
    this.mValueDeck.selectedIndex = 0;
    this.mValueText.value = value;
    this.mValueText.disabled = (elem.hasdefault && elem.isdefault);
  }
  else if (elem.type=="boolean") {
    this.mValueDeck.selectedIndex = 1;
    this.mValueCheck.checked = value;
    this.mValueCheck.label = value?"true":"false";
    this.mValueCheck.disabled = (elem.hasdefault && elem.isdefault);
    dd("GenPropEdit> BoolProp, name="+elem.name+", value=<"+value+">");
  }
  else if (elem.type=="object<AbstractColor>") {
    //dd("GenPropEdit> ColorProp, name="+elem.name+", value=<"+value+">");
    this.mValueDeck.selectedIndex = 2;
    this.mColPicker.setColorText(value);
    this.mColPicker.disabled = (elem.hasdefault && elem.isdefault);
  }
  else if (elem.type=="enum") {
    this.mValueDeck.selectedIndex = 3;
    this.populateEnumList(value, elem.enumdef);
  }
  else if (elem.type=="object<Vector>") {
    dd("GenPropEdit> VectorProp, name="+elem.name+", value=<"+value+">");
    //dd(debug.dumpObjectTree(value));
    var res = value.match(/\((.+),(.+),(.+)\)/);
    dd("X: "+res[1]);
    dd("Y: "+res[2]);
    dd("Z: "+res[3]);
    this.mVecEditX.value = res[1];
    this.mVecEditY.value = res[2];
    this.mVecEditZ.value = res[3];

    this.mVecEditX.disabled =
      this.mVecEditY.disabled =
        this.mVecEditZ.disabled =
            (elem.hasdefault && elem.isdefault);

    this.mVecEditX.readOnly =
      this.mVecEditY.readOnly =
        this.mVecEditZ.readOnly = elem.readonly;
    
    this.mValueDeck.selectedIndex = 5;
  }
  else if (elem.type=="object<TimeValue>") {
    dd("GenPropEdit> TimeValProp, name="+elem.name+", value=<"+value+">");
    //let tval = cuemol.createObj("TimeValue");
    //tval.strval = value;
    //let tmsec = tval.getMilliSec(false);
    //dd("GenPropEdit> TimeValProp, value(msec)=<"+tmsec+">");
    //this.mTimeEdit.value = tmsec;
    this.mTimeEdit.strvalue = value;
    this.mValueDeck.selectedIndex = 6;
  }
  else {
    this.mDefaultCheck.disabled = true;
    this.mValueDeck.selectedIndex = 4;
  }
}

klass.populateEnumList = function (value, enumdef)
{
  this.mValueEnum.removeAllItems();
  var sel = null;

  var nlen = enumdef.length;
  for (var i=0; i<nlen; ++i) {
    var elem = enumdef[i];
    dd("PopulateEnumList: "+elem);
    var item = this.mValueEnum.appendItem(elem);
    if (elem==value)
      sel = item;
  }
  this.mValueEnum.selectedItem = sel;
}

klass.boolToggleCheck = function(aEvent)
{
  if (this.mValueCheck.disabled) return;

  var row = this.mEditTgtRow;
  var elem = this.mVisibleData[row];
  if (!elem) {
    dd("Invalid tree selection: " +aEvent.currentTarget.currentIndex);
    return;
  }

  dd("bool togglecheck: "+this.mValueCheck.checked);

  var value = this.mValueCheck.checked;
  this.mValueCheck.label = value?"true":"false";
  elem.value = value;
  this.mTreeView.treebox.invalidateRow(row);
  elem.changed = true;
}

klass.defaultToggleCheck = function(aEvent)
{
  if (this.mDefaultCheck.disabled) return;

  var row = this.mEditTgtRow;
  var elem = this.mVisibleData[row];
  if (!elem) {
    dd("Invalid tree selection: " +aEvent.currentTarget.currentIndex);
    return;
  }

  dd("default togglecheck: "+this.mDefaultCheck.checked);

  var newvalue = this.mDefaultCheck.checked;
  if (newvalue) {
    // Value is default --> disable input
    this.mValueText.disabled = true;
    this.mValueCheck.disabled = true;
    this.mValueEnum.disabled = true;
    this.mColPicker.disabled = true;
  }
  else {
    // Value is non-default --> enable input
    this.mValueText.disabled = false;
    this.mValueCheck.disabled = false;
    this.mValueEnum.disabled = false;
    this.mColPicker.disabled = false;
  }

  // change the flag
  elem.isdefault = newvalue;
}

/// Widgets --> mObjData/mVisibleData
klass.validateChanges = function()
{
  if (this.mEditTgtRow==undefined) return;
  var row = this.mEditTgtRow;
  var elem = this.mVisibleData[row];

  dd("validate change = "+row);

  if (!elem) {
    dd("Invalid tree selection: " +aEvent.currentTarget.currentIndex);
    return;
  }

  // Boolean property
  if (this.mValueDeck.selectedIndex==1) {
    if (elem.type!="boolean") {
      dd("##### FATAL ERROR !! Inconsistent boolean prop @ validateChages");
      return;
    }
    return;
  }

  // Color property
  if (this.mValueDeck.selectedIndex==2) {
    if (elem.type!=="object<AbstractColor>") {
      dd("##### FATAL ERROR !! Inconsistent color prop @ validateChages.");
      return;
    }
    
    elem.value = this.mColPicker.getColorText();
    elem.changed = true;
    this.mTreeView.treebox.invalidateRow(row);
    return;
  }

  // Enum property
  if (this.mValueDeck.selectedIndex==3) {
    if (elem.type!=="enum") {
      dd("##### FATAL ERROR !! Inconsistent enum prop @ validateChages");
      return;
    }

    elem.value = this.mValueEnum.selectedItem.label;
    elem.changed = true;
    this.mTreeView.treebox.invalidateRow(row);
    return;
  }

  // Vector property
  if (this.mValueDeck.selectedIndex==5) {
    if (elem.type!=="object<Vector>") {
      dd("##### FATAL ERROR !! Inconsistent vector prop @ validateChages");
      return;
    }

    var x = this.mVecEditX.value;
    var y = this.mVecEditY.value;
    var z = this.mVecEditZ.value;

    elem.value = "("+x+","+y+","+z+")";
    elem.changed = true;
    this.mTreeView.treebox.invalidateRow(row);
    return;
  }

  // TimeValue property
  if (this.mValueDeck.selectedIndex==6) {
    if (elem.type!=="object<TimeValue>") {
      dd("##### FATAL ERROR !! Inconsistent vector prop @ validateChages");
      return;
    }

    //let msec = this.mTimeEdit.value;
    //let tval = cuemol.createObj("TimeValue");
    //tval.intval = msec;
    //elem.value = tval.toString();

    elem.value = this.mTimeEdit.strvalue;
    elem.changed = true;
    this.mTreeView.treebox.invalidateRow(row);
    return;
  }

  // Prop with text values (selectedIndex==0)

  // String property
  if (this.mPropTypeText.value=="string") {
    elem.value = this.mValueText.value;
    elem.changed = true;
    this.mTreeView.treebox.invalidateRow(row);
    return;
  }

  if (!this.mValueText.value)
    return;

  if (this.mPropTypeText.value=="integer") {
    // Integer property
    var value = parseInt(this.mValueText.value, 10);
    if (isNaN(value)) {
      this.mValueText.value = elem.value;
    }
    else {
      elem.value = value;
      elem.changed = true;
    }
    this.mTreeView.treebox.invalidateRow(row);
  }
  else if (this.mPropTypeText.value=="real") {
    // Real num property
    let value = parseFloat(this.mValueText.value);
    if (isNaN(value)) {
      this.mValueText.value = elem.value;
    }
    else {
      elem.value = value;
      elem.changed = true;
    }
    this.mTreeView.treebox.invalidateRow(row);
  }
  else if (this.mPropTypeText.value=="object<MolSelection>") {
    // MolSelection property
    var ctxtid = this.mTgtSceID;
    var selobj = cuemol.makeSel(this.mValueText.value, ctxtid);
    if (selobj===null) {
      // Compile failed --> restore orig value
      this.mValueText.value = elem.value;
    }
    else {
      elem.value = this.mValueText.value;
      elem.changed = true;
      elem.new_object = selobj;
    }
    this.mTreeView.treebox.invalidateRow(row);
  }
  else if (this.mPropTypeText.value=="object<Matrix>") {
    // Matrix4D property
    let value = null;
    try {
      value = cuemol.createObj("Matrix", this.mValueText.value);
    }
    catch (e) {
      dd("GenPropEditor> cannot convert value "+this.mValueText.value+" to matrix");
    }
    if (value==null) {
      // conversion failed --> restore orig value
      this.mValueText.value = elem.value;
    }
    else {
      elem.value = value;
      elem.changed = true;
    }
    this.mTreeView.treebox.invalidateRow(row);
  }

  // this.mPropNameText.value = elem.name;
}

////////////////////////////////////

klass.buildVisibleData = function()
{
  this.mVisibleData = this.mObjData;
  this.mTreeView.rowCount = this.mVisibleData.length;
};

klass.onDialogAccept = function(event)
{
  // notify tab to leave from dlg
  //  --> save changes from GUI
  this.notifyTab("onInactivate", this.mCurTabId);

  this.applyChangesImpl();
  
  // set return value
  var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 
  args.bOK = true;

  return true;
};

klass.applyChangesImpl = function ()
{
  var scene = cuemol.getScene(this.mTgtSceID);

  if (!scene) {
    dd("*** FATAL ERROR: Scene is null, cannot change props!! ***");
    return true;
  }

  // EDIT TXN START //
  scene.startUndoTxn("Change props");
  try {

    //var chgRecur = function (aObjData, aPfx) {
    function chgRecur(aObjData, aPfx) {
      for (var i=0; i<aObjData.length; ++i) {
        var elem = aObjData[i];
        var test_name = aPfx+elem.name;

        //dd("GenPropEdit.onDlgAc> prop name="+test_name+", type="+typeof elem.value);
        if (typeof elem.value == 'object' &&
            elem.type!="object<Matrix>") {
          dd("GenPropEditor> recursive chgRecur called for "+test_name);
          chgRecur.call(this, elem.value, test_name+".");
          continue;
        }
        
        if (elem.hasdefault && (elem.isdefault!=elem.orig_isdefault)) {
          dd("GenPropEditor> Default flag for \""+test_name+"\" changed");
          this.commitPropChange(test_name, elem);
        }
        else if (elem.changed && elem.value!=elem.orig_value) {
          dd("GenPropEditor> Prop "+test_name+" changed to "+elem.value);
          this.commitPropChange(test_name, elem);
        }
      }
    };
    
    chgRecur.call(this, this.mObjData, "");
  }
  catch(e) {
    dd("GenPropEditor> SetProp ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return false;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  // contents synchronized --> disable apply/cancel buttons
  if (this.mApplyBtn)
    this.mApplyBtn.disabled = true;
  this.mCancelBtn.disabled = true;
};


/// Commit prop changes (stored in elem) to the target object
klass.commitPropChange = function(aName, elem)
{
  // Ignore props whose parent is changed or removed
  if (!cuemol.hasProp(this.mTgtObj, aName))
    return;

  if (elem.isdefault && !elem.orig_isdefault) {
    // reset to default
    try {
      cuemol.resetProp(this.mTgtObj, aName);
    }
    catch (err) {
      dd("Reset prop ["+aName+"] failed ("+err.description+")");
      debug.exception(err);
    }
    return;
  }

  try {
    if (elem.type=="object<MolSelection>") {
      if (elem.new_object) {
        //dd("MolSelection, newobj="+elem.new_object._wrapped.getClassName());
        //this.mTgtObj._wrapped.setProp(aName, elem.new_object._wrapped);
        cuemol.setProp(this.mTgtObj, aName, elem.new_object);
      }
      else {
        // evalueta selstr here to resolve reference by using scene context ID (mTgtSceID)
        let selobj = cuemol.makeSel(elem.value, this.mTgtSceID);
        //this.mTgtObj._wrapped.setProp(aName, selobj._wrapped);
        cuemol.setProp(this.mTgtObj, aName, selobj);
      }
    }
    else {
      cuemol.setProp(this.mTgtObj, aName, elem.value);
    }
  }
  catch (err) {
    dd("Change prop ["+aName+"] to ["+elem.value+"] failed ("+err.description+")");
    debug.exception(err);
  }
};

/////////////////////////////////////////////////////////////
// Interface

klass.registerPage = function (aTabId, aObj)
{
  this.mTabs[aTabId] = aObj;
};

klass.getSceneID = function ()
{
  return this.mTgtSceID;
};

klass.getObjID = function ()
{
  return this.mTgtObjID;
};

klass.getClientObjID = function ()
{
  var rend = cuemol.getRenderer(this.mTgtObjID);
  if (rend==null)
    return null;
  return rend.getClientObjID();
};

klass.getRendType = function ()
{
  if ("type_name" in this.mTgtObj)
    return this.mTgtObj.type_name;
  return null;
};

klass.updateWidgets = function ()
{
  this.buildVisibleData();
  this.mTreeView.treebox.rowCountChanged(0, this.mTreeView.rowCount);
  dd("GenPropEdit.UpdateWidgets rowcnt="+this.mTreeView.rowCount);
};

klass.findPropData = function (aName)
{
  if (this.mObjData==null) {
    dd("findPropData Warning: propeditor not initialized!!");
    return null;
  }
  
  function findRecur (objdata, aPfx) {
    for (var i=0; i<objdata.length; ++i) {
      var elem = objdata[i];
      var test_name = aPfx+elem.name;
      
      // dd("findPropData> test_name="+test_name);
      // dd("              aName="+aName);
      if (test_name == aName)
        return elem;
      
      if (typeof elem.value == 'object') {
        var res = findRecur(elem.value, test_name+".");
        if (res!==null)
          return res;
      }
    }
    return null;
  }

  return findRecur(this.mObjData, "");
};

klass.updateData = function (aPropName, aPropValue)
{
  var elem;

  elem = this.findPropData(aPropName);
  if (elem==null) {
    dd("PropEdit> updateData unknown prop: "+aPropName);
    return false;
  }

  // dd("Update> name="+aPropName);
  // dd("Update>   orig_val="+elem.orig_value);
  // dd("Update>   cur_val="+elem.value);
  // dd("Update>   new_val="+aPropValue);

  if (aPropValue==elem.orig_value) {
    if (aPropValue==elem.value) {
      return false;
    }
    else {
      // --> reset to the original value
      elem.value = aPropValue;
      elem.changed = false;
      return true;
    }
  }

  elem.value = aPropValue;
  elem.changed = true;
  
  // data changed --> enable apply/cancel buttons
  if (this.mApplyBtn)
    this.mApplyBtn.disabled = false;
  this.mCancelBtn.disabled = false;

  return true;
};

klass.updateDefault = function (aPropName, aIsDefault)
{
  var elem;

  elem = this.findPropData(aPropName);
  if (elem==null) {
    dd("PropEdit> updateDefault unknown prop: "+aPropName);
    return;
  }

  if (elem.isdefault==aIsDefault)
    return; // not changed

  elem.isdefault = aIsDefault;

  // data changed --> enable apply/cancel buttons
  if (this.mApplyBtn)
    this.mApplyBtn.disabled = false;
  this.mCancelBtn.disabled = false;
};

klass.resetAllToDefault = function ()
{
  var res = util.confirm(window, "Reset all to default?");
  if (!res) {
    dd("Reset all to default: canceled, res = "+res);
    return;
  }

  var scene = cuemol.getScene(this.mTgtSceID);

  // EDIT TXN START //
  scene.startUndoTxn("Reset all to default");
  var that = this;
  try {
    ( function (objdata, aPfx) {
      for (var i=0; i<objdata.length; ++i) {
        var elem = objdata[i];
        var test_name = aPfx+elem.name;

        if (test_name == "name" ||
            test_name == "sel")
          continue;

        if (!elem.hasdefault)
          continue; // no default value

        if (elem.orig_isdefault)
          continue; // originally default -> don't have to change

        if (!cuemol.hasProp(that.mTgtObj, test_name))
          continue; // prop's parent is changed -> ignore
        
        dd("target obj: "+that.mTgtObj+", propname="+test_name);
        cuemol.resetProp(that.mTgtObj, test_name);

        if (typeof elem.value=='object')
          arguments.callee(elem.value, test_name+".");
      }
    } ) (this.mObjData, "");
  }
  catch(e) {
    dd("GenPropEditor> ResetDefault error: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    util.alert(window, "Reset to default failed: "+e);
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
  
  // close window
  window.close();
};

klass.apply = function ()
{
  // notify tab to leave from dlg
  //  --> save changes from GUI
  this.notifyTab("onInactivate", this.mCurTabId);

  // apply changes to this.mTgtObj
  this.applyChangesImpl();
  
  // reload data from this.mTgtObj
  this.populateData(this.mTgtObj);

  // reload GUI of active tab
  this.notifyTab("onActivate", this.mCurTabId);
};

return ctor;

} ) ();
}

