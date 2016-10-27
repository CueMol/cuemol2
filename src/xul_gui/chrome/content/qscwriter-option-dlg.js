
var dlgdata = window.arguments[0];

function onLoad(aEvent)
{
  // default: qdf1
  document.getElementById('qdf-version').selectedIndex = 1;

  document.getElementById('chk_force_embed').checked = false;

  document.getElementById('chk_base64').checked = false;
  document.getElementById('chk_base64').disabled = false;

  // default: xz
  document.getElementById('comp_opt').selectedIndex = 0;
  document.getElementById('comp_opt').disabled = false;
}

function onDialogAccept(aEvent)
{
  dlgdata.embedAll = document.getElementById('chk_force_embed').checked;

  var selitem = document.getElementById('qdf-version').selectedItem;

  dlgdata.version = selitem.value;

  if (selitem.value=="QDF0") {
    dlgdata.base64 = false;
    dlgdata.compress = "none";
  }
  else {
    dlgdata.base64 = document.getElementById('chk_base64').checked;
    dlgdata.compress = document.getElementById('comp_type').selectedItem.value;
  }

  dlgdata.ok = true;
  return true;
}

function onSelect(aEvent)
{
  var selitem = document.getElementById('qdf-version').selectedItem;
  if (selitem.value=="QDF0") {
    document.getElementById('chk_base64').disabled = true;
    document.getElementById('comp_type').disabled = true;
  }
  else {
    document.getElementById('chk_base64').disabled = false;
    document.getElementById('comp_type').disabled = false;
  }
}

