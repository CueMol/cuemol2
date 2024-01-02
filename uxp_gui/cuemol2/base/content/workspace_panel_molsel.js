ws.selectMol = function (aSelStr)
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="object") return;

  var target = cuemol.getObject(elem.obj_id);
  if (!('sel' in target))
    return;

  var scene = target.getScene();
  var sel;

  // EDIT TXN START //
  if (aSelStr) {
    sel = cuemol.makeSel(aSelStr);
    scene.startUndoTxn("Select molecule");
  }
  else {
    sel = cuemol.createObj("SelCommand");
    scene.startUndoTxn("Unselect molecule");
  }

  try {
    target.sel = sel;
  }
  catch(e) {
    dd("SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

  // Save to history
  util.selHistory.append(aSelStr);
}

/// Invert selection
ws.invertMolSel = function ()
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="object") return;

  var target = cuemol.getObject(elem.obj_id);
  if (!('sel' in target))
    return;

  cuemolui.molSelInvert(target);
};

/// Toggle bysidech modifier
ws.toggleSideCh = function ()
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="object") return;

  var target = cuemol.getObject(elem.obj_id);
  if (!('sel' in target))
    return;

  cuemolui.molSelToggleSideCh(target);
};

ws.aroundMolSel = function (aDist, aByres)
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="object") return;

  var target = cuemol.getObject(elem.obj_id);
  if (!('sel' in target))
    return;

  cuemolui.molSelAround(target, aDist, aByres);
}

ws.setRendSel = function (aSelStr)
{
  var rend = this.getSelectedRend();
  if (rend==null)
    return;
  
  var mol = rend.getClientObj();
  if (!('sel' in rend) || !('sel' in mol))
    return;

  var sel;

  if (aSelStr=='current') {
    sel = mol.sel;
  }
  else {
    sel = cuemol.makeSel(aSelStr);
  }

  var scene = rend.getScene();

  // EDIT TXN START //
  scene.startUndoTxn("Set renderer sel");

  try {
    rend.sel = sel;
  }
  catch(e) {
    dd("SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
};

