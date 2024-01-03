//
//
// Drag&drop impl for obj&rend
//

ws.onDragStart = function (event)
{
  dd("WSItem dragStart: "+event.target.localName);

  if (event.target.localName != "treechildren")
    return;

  if (this.mViewObj.isMultiSelected()) {
    let elemList = this.mViewObj.getSelectedNodeList();
    let type = this.checkElemTypes(elemList);
    dd("multi-type="+type);
    if (type!="renderer") {
      return;
    }

    let nsel = elemList.length;
    let obj_id = 0;
    for (let i=0; i<nsel; ++i) {
      let elem = elemList[i];
      dd("par_id="+elem.parent_id);
      if (obj_id==0)
	obj_id = elem.parent_id;
      else if (obj_id!=elem.parent_id) {
	dd("par_id!==obj_id "+obj_id);
	return;
      }
    }

    let dt = event.dataTransfer;
    for (let i=0; i<nsel; ++i)
      dt.mozSetDataAt(ITEM_DROP_TYPE, elemList[i], i);
    event.stopPropagation();
    return;
  }

  var elem = this.mViewObj.getSelectedNode();
  dd("elem: "+elem.type);

  if (elem.type!="object" &&
      elem.type!="renderer" &&
      elem.type!="rendGroup")
    return;

  let dt = event.dataTransfer;
  dt.mozSetDataAt(ITEM_DROP_TYPE, elem, 0);

  event.stopPropagation();
};

ws.canDrop = function (elem, ori, dt)
{
  dd("ws candrop called");

  if (elem.type!="object" &&
      elem.type!="renderer" &&
      elem.type!="rendGroup")
    return false;

  var types = dt.mozTypesAt(0);
  if (types[0] != ITEM_DROP_TYPE)
    return false;

  var sourceElem = dt.mozGetDataAt(ITEM_DROP_TYPE, 0);
  dd("source elem type = "+sourceElem.type);
  dd("target elem type = "+elem.type);
  
  if (sourceElem.type=="renderer") {
    // Drop source=renderer

    // target should be rend or rendgrp
    if (elem.type!="renderer" && elem.type!="rendGroup")
      return false;

    if (elem.parent_id!=sourceElem.parent_id) {
      let destpar = this.findNodeByObjId(elem.parent_id);
      let srcpar = this.findNodeByObjId(sourceElem.parent_id);
      if (srcpar.type=="object") {
	if (destpar.type=="object") {
	  // cannot drop across different objects
	  return false;
	}
	else if (destpar.type=="rendGroup" &&
		 destpar.parent_id==sourceElem.parent_id) {
	  // Drop from obj to rendGrp
	  return true;
	}
      }
      else if (srcpar.type=="rendGroup") {
	if (destpar.type=="object" &&
	    srcpar.parent_id==elem.parent_id) {
	  // Drop from rendGrp to obj (in the same obj)
	  return true;
	}
	else if (destpar.type=="rendGroup" &&
		 destpar.parent_id==srcpar.parent_id) {
	  // Drop across different group in the same obj
	  return true;
	}
      }

      return false;
    }
    
    // Drop in object
    return true;
  }
  else if (sourceElem.type=="rendGroup") {
    // Drop source=renderer group

    // Target should be rend or rendgrp
    if (elem.type!="renderer" && elem.type!="rendGroup")
      return false;

    // Cannot drop rendgrp into other rendgrp
    if (elem.type=="rendGroup" && ori==0)
      return false;

    // Cannot drop rendgrp into other rendgrp
    if (elem.parent_id!=sourceElem.parent_id)
      return false;
  }
  else {
    // object
    if (elem.type!="object") return false;
    // if (ori==0) return false;
  }

  return true;
};

ws.drop = function (elem, ori, dt)
{
  dd("ws dropped");

  if (elem.type!="object" &&
      elem.type!="renderer" &&
      elem.type!="rendGroup")
    return;

  var types = dt.mozTypesAt(0);
  if (types[0] != ITEM_DROP_TYPE)
    return;

  for (let i=0; i<dt.mozItemCount; ++i) {
    let sourceElem = dt.mozGetDataAt(ITEM_DROP_TYPE, i);
    this.dropImpl(elem, ori, dt, sourceElem);
  }
}


ws.dropImpl = function (elem, ori, dt, sourceElem)
{
  let dst_type = elem.type;
  let dst_parent_id = elem.parent_id;
  let dst_id = elem.obj_id;
  if (elem.type=="rendGroup"&&ori==0) {
    // Drop into the renderer group
    dd("Drop into the renderer group, ori==0");
    dst_type="renderer";
    dst_parent_id = elem.obj_id;
    if (elem.childNodes.length>0)
      dst_id = elem.childNodes[0].obj_id;
  }

  dd("source elem type = "+sourceElem.type);
  dd("target elem type = "+dst_type);
  
  if (sourceElem.type=="renderer") {
    // Drop source=renderer

    // target should be rend or rendgrp
    if (dst_type!="renderer" && dst_type!="rendGroup")
      return;

    let id1 = sourceElem.obj_id;
    let id2 = dst_id;

    let srcpar = this.findNodeByObjId(sourceElem.parent_id);

    if (dst_parent_id!=sourceElem.parent_id) {
      let destpar = this.findNodeByObjId(dst_parent_id);
      // dd("destpar="+debug.dumpObjectTree(destpar));

      if (srcpar.type=="object") {
	if (destpar.type=="object") {
	  // cannot drop across different objects
	  dd("cannot drop across different objects");
	}
	else if (destpar.type=="rendGroup" &&
		 destpar.parent_id==sourceElem.parent_id) {
	  // Drop from obj to rendGrp
	  let grpname = destpar.orig_name;
	  dd("*** Drop from obj to rendGrp: "+grpname);
	  this.moveRendTo(sourceElem.parent_id, id1, id2, ori, grpname);
	}
      }
      else if (srcpar.type=="rendGroup") {
	if (destpar.type=="object" &&
	    srcpar.parent_id==dst_parent_id) {
	  // Drop from rendGrp to obj (in the same obj)
	  dd("Drop from rendGrp to obj (in the same obj)");
	  this.moveRendTo(dst_parent_id, id1, id2, ori, "");
	}
	else if (destpar.type=="rendGroup" &&
		 destpar.parent_id==srcpar.parent_id) {
	  // Drop across different group in the same obj
	  let grpname = destpar.orig_name;
	  dd("Drop across different group ("+grpname+") in the same obj");
	  this.moveRendTo(sourceElem.parent_id, id1, id2, ori, grpname);
	}
      }

      return;
    }

    if (srcpar.type=="rendGroup") {
      // Movement in the same group
      this.moveRendTo(srcpar.parent_id, id1, id2, ori);
      return;
    }

    this.moveRendTo(dst_parent_id, id1, id2, ori);
  }
  else if (sourceElem.type=="rendGroup") {
    // Drop source=renderer group
    // Target should be rend or rendgrp
    if (dst_type!="renderer" && dst_type!="rendGroup")
      return;
    // Cannot drop rendgrp into other rendgrp
    if (dst_type=="rendGroup" && ori==0)
      return;
    // Cannot drop rendgrp into other rendgrp
    if (dst_parent_id!=sourceElem.parent_id)
      return;

    let id1 = sourceElem.obj_id;
    let id2 = elem.obj_id;
    this.moveRendTo(dst_parent_id, id1, id2, ori);
  }
  else {
    // object
    if (dst_type!="object")
      return;

    // if (ori==0) return;

    let id1 = sourceElem.obj_id;
    let id2 = elem.obj_id;
    if (id1==id2) return;

    this.moveObjTo(id1, id2, ori);
  }

};

ws.moveRendTo = function (objid, id1, id2, ori, destgrp)
{
  var i;
  let rend1 = cuemol.getRenderer(id1);
  let rend2 = cuemol.getRenderer(id2);
  let rends=new Array();
  let imax = this._nodes.length;

  // set group name
  if (destgrp) {
    if (rend1.group!=destgrp) {
      dd("!!! Set group "+destgrp);
      rend1.group = destgrp;
    }
  }
  else {
    if (rend1.group!="") {
      dd("!!! Clear group");
      rend1.group = "";
    }
  }

  for (i=0; i<imax; ++i) {
    let nd = this._nodes[i];
    if (nd.type!="object") continue;
    if (nd.obj_id==objid) {
      let obj = cuemol.getObject(objid);
      dd("Rend list for obj:"+obj.name);
      let renduids = obj.rend_uids.split(",");
      for (i=0; i<renduids.length; ++i) {
	let uid = parseInt(renduids[i]);
	dd("Rend UID="+uid);
        rends.push( cuemol.getRenderer(uid) );
      }
      /*let rendnodes = nd.childNodes;
	for (i=0; i<rendnodes.length; ++i) {
        rends.push( cuemol.getRenderer(rendnodes[i].obj_id) );
	}*/
      break;
    }
  }
  
  if (rends.length==0)
    return;
  
  dd("Rend list OK");

  this._moveToImpl(rends, rend1, rend2, ori);
};

ws.moveObjTo = function (id1, id2, ori)
{
  var i;
  let obj1 = cuemol.getObject(id1);
  let obj2 = cuemol.getObject(id2);
  let objs=new Array();
  let imax = this._nodes.length;
  for (i=0; i<imax; ++i) {
    let nd = this._nodes[i];
    if (nd.type=="object") {
      objs.push( cuemol.getObject(nd.obj_id) );
    }
  }
  
  if (objs.length==0)
    return;
  
  this._moveToImpl(objs, obj1, obj2, ori);
};

ws._moveToImpl = function (rends, rend1, rend2, ori)
{
  let ord_1 = rend1.ui_order;
  let ord_2 = rend2.ui_order;

  dd("Move from "+ord_1+" to "+ord_2);

  // check orientation
  if (ori!=0) {
    let irow2 = -1;
    for (i=0; i<rends.length; ++i) {
      if (rends[i].uid==rend2.uid) {
        irow2 = i;
        break;
      }
    }
    if (irow2==-1) {
      dd("ERROR: irow for rend2 not found");
      return;
    }
  
    if (ord_1<ord_2) {
      if (ori==-1) {
        // shift-up the target location (rend2)
        if (irow2-1<0) {
          dd("ERROR -1: row before rend2 not found: "+irow2);
          return;
        }
        rend2 = rends[irow2-1];
        ord_2 = rend2.ui_order;
      }
    }
    else {
      if (ori==1) {
        // shift-down the target location (rend2)
        if (irow2+1<0) {
          dd("ERROR +1: row after rend2 not found: "+irow2);
          return;
        }
        rend2 = rends[irow2+1];
        ord_2 = rend2.ui_order;
      }
    }
  }

  dd("Rearranged Move from "+ord_1+" to "+ord_2);

  if (ord_1==ord_2) {
    // no movement
    dd("no movement");
    // Update of tree is required here,
    // because the group of rend can be changed...
    // return;
  }
  else if (ord_1<ord_2) {
    // move down
    dd("Move down");
    for (i=rends.length-1; i>=0; --i) {
      if (rends[i].ui_order==ord_2)
        break;
    }
    for (; i>=1; --i) {
      rend1 = rends[i-1];
      rend2 = rends[i];
      // swap UI order
      dd("Xchg: "+(i-1)+", "+i);
      let o = rend1.ui_order;
      rend1.ui_order = rend2.ui_order;
      rend2.ui_order = o;
      if (o==ord_1)
        break;
    }
  }
  else {
    // move up
    dd("Move up");
    for (i=0; i<rends.length-1; ++i) {
      if (rends[i].ui_order==ord_2)
        break;
    }
    for (; i<rends.length-1; ++i) {
      rend2 = rends[i];
      rend1 = rends[i+1];
      // swap UI order
      dd("Xchg: "+i+", "+(i+1));
      let o = rend1.ui_order;
      rend1.ui_order = rend2.ui_order;
      rend2.ui_order = o;
      if (o==ord_1)
        break;
    }
  }

  this.mViewObj.saveOpenState(this.mTgtSceneID);
  this.syncContents(this.mTgtSceneID);
};



/*
ws.onMoveUpCmd = function (aEvent)
{
  let elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  if (elem.type=="object")
    this.onMoveUpObj(elem);
  else if (elem.type=="renderer")
    this.onMoveUpDownRend(elem, -1);
};

ws.onMoveDownCmd = function (aEvent)
{
  let elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  if (elem.type=="object")
    this.onMoveDownObj(elem);
  else if (elem.type=="renderer")
    this.onMoveUpDownRend(elem, +1);
}

ws.onMoveUpObj = function (elem)
{
  let id = elem.obj_id;

  let prev_id = -1;
  let i, imax = this._nodes.length;

  for (i=0; i<imax; ++i) {
    let nd = this._nodes[i];
    if (nd.type!="object") continue;
    if (nd.obj_id==id)
      break;
    prev_id = nd.obj_id;
  }
  
  dd("prev_id = "+prev_id);
  dd("id = "+id);
  if (prev_id<0) {
    dd("cannot move up");
    return;
  }

  this.swapNodes(prev_id, id, true);
  this.selectByUID(id);
}

ws.onMoveDownObj = function (elem)
{
  let id = elem.obj_id;

  let prev_id = -1;
  let i, imax = this._nodes.length;
  for (i=imax-1; i>=0; --i) {
    elem = this._nodes[i];
    if (elem.type!="object") continue;
    if (elem.obj_id==id)
      break;
    prev_id = elem.obj_id;
  }

  dd("prev_id = "+prev_id);
  dd("id = "+id);
  if (prev_id<0) {
    dd("cannot move down");
    return;
  }

  this.swapNodes(prev_id, id, true);
  this.selectByUID(id);
}

ws.onMoveUpDownRend = function (elem, idelta)
{
  let id = elem.obj_id;

  let irow = this.mViewObj.getSelectedRow();
  let irow_prev = irow + idelta;

  let elem_prev = this.mViewObj.getNodeByRow(irow_prev);
  if (!elem_prev) return;
  let id_prev = elem_prev.obj_id;

  dd("prev_id = "+id_prev);
  dd("id = "+id);

  if ((elem.type=="renderer" && elem_prev.type=="renderer")) {
    this.swapNodes(id_prev, id, false);
    this.selectByUID(id);
  }
  else {
    dd("cannot move up renderer");
  }
  
  return;
}

ws.swapNodes = function (prev_id, id, bObj)
{
  var obj1, obj2;
  if (bObj) {
    obj1 = cuemol.getObject(prev_id);
    obj2 = cuemol.getObject(id);
  }
  else {
    obj1 = cuemol.getRenderer(prev_id);
    obj2 = cuemol.getRenderer(id);
  }
  if (obj1==null || obj2==null) {
    dd("cannot swap/err1");
    return;
  }

  let uio = obj1.ui_order;
  obj1.ui_order = obj2.ui_order;
  obj2.ui_order = uio;

  this.mViewObj.saveOpenState(this.mTgtSceneID);
  this.syncContents(this.mTgtSceneID);
}
*/

