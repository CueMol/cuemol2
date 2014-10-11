//
//  Shortcut manager
//
// $Id: shortcut-manager.js,v 1.2 2011/02/06 14:08:24 rishitani Exp $
//

if (!("shortcut" in cuemolui)) {

cuemolui.shortcut = ( function() {

// constructor
var ctor = function ()
{
  this.mTable = new Object();
  this.mKeySet = null;
}

ctor.prototype.init = function (aKeySet)
{
  this.mKeySet = aKeySet;
  while (this.mKeySet.firstChild)
    this.mKeySet.removeChild(this.mKeySet.firstChild);

  for (var id in this.mTable) {
    this.createKey(id);
  }

}

ctor.prototype.reg = function (aId, aDefKey, aDefModifs, aDefFunc)
{
  this.mTable[aId] = {
    "id": aId,
    "func": aDefFunc
  };

  var def = this.mTable[aId];
  if (aDefKey.indexOf("VK_")==0) {
    // virtual key code
    def.defKeyCode = aDefKey;
    def.defKeyChar = "";
  }
  else {
    // key char
    def.defKeyChar = aDefKey;
    def.defKeyCode = "";
  }
  def.defModifs = aDefModifs;

  def.keyCode = def.defKeyCode;
  def.keyChar = def.defKeyChar;
  def.modifs = def.defModifs;

  if (this.mKeySet==null)
    return;

  this.createKey(aId);
};

ctor.prototype.createKey = function (aId)
{
  if (! (aId in this.mTable) ) {
    dd("shortcut "+aId+"is not defined!!");
    return;
  }

  var def = this.mTable[aId];

  var key = document.createElementNS(
    "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    "key");

  key.setAttribute("id", aId);
  if (def.keyCode)
    key.setAttribute("keycode", def.keyCode);
  if (def.keyChar)
    key.setAttribute("key", def.keyChar);
  key.setAttribute("modifiers", def.modifs);
  key.setAttribute("oncommand", "cuemolui.shortcut.onCommand(event)");
  //key.setAttribute("oncommand", "dd('XXX')");

  this.mKeySet.appendChild(key);

  def.elem = key;

  //alert("Register shortcut key: "+aId+
  //", keycode="+def.keyCode+", key="+def.keyChar+", modifiers="+def.modifs);
};

ctor.prototype.changeBinding = function (aId, aKey, aModifs)
{
  if (! (aId in this.mTable) ) {
    dd("shortcut "+aId+"is not defined!!");
    return;
  }

  var def = this.mTable[aId];
  if (aKey.indexOf("VK_")==0) {
    // virtual key code
    def.keyCode = aKey;
    def.keyChar = "";
  }
  else {
    // key char
    def.keyChar = aKey;
    def.keyCode = "";
  }
  def.modifs = aModifs;

/*
  if (this.mKeySet==null)
    return

  while (this.mKeySet.firstChild)
    this.mKeySet.removeChild(this.mKeySet.firstChild);

  for (var id in this.mTable) {
    this.createKey(id);
  }
*/

  if (def.elem===undefined||def.elem===null)
    return;

  var key = def.elem;

  if (def.keyCode) {
    key.setAttribute("keycode", def.keyCode);
    key.removeAttribute("key");
  }
  if (def.keyChar) {
    key.setAttribute("key", def.keyChar);
    key.removeAttribute("keycode");
  }
  key.setAttribute("modifiers", def.modifs);
  
  //alert("KeyBinding changed");
}

ctor.prototype.invalidateCache = function ()
{
  this.mKeySet.parentNode.insertBefore(this.mKeySet, this.mKeySet.nextSibling);
}

/*
    
  alert("setupShortcutKeys OK.");
*/

ctor.prototype.onCommand = function (aEvent)
{
  var id = aEvent.target.id;
  
  if (! (id in this.mTable) ) {
    dd("shortcut "+id+"is not defined!!");
    return;
  }

  this.mTable[id].func.call(this, id);
};

return new ctor;

} )();

}


