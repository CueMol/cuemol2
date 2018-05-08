//
// MTZ file option dialog implementation
//

( function () {

let dlgdata = window.arguments[0];
let util = require("util");

window.gMtzDlg = {
onInit: function () {
  try {
    let ok = window.gDlgObj.selectShowTab(dlgdata.target[0].reader_name, "mtzmap");
    if (!ok) return;
    
    let rdr = dlgdata.target[0].reader;
    let json = rdr.getColumnInfoJSON();
    dd("column info: "+json);
    this.mData = JSON.parse(json);

    this.mAmpList = document.getElementById("mtzopt-flist");
    this.mPhiList = document.getElementById("mtzopt-philist");
    this.mWgtList = document.getElementById("mtzopt-wgtlist");

    this.mData.forEach( function (elem) {
      let i;
      switch (elem.type) {
      case "F":
	i = this.mAmpList.appendItem(elem.name);
	i.label = i.value = elem.name;
	break;
      case "P":
	i = this.mPhiList.appendItem(elem.name);
	i.label = i.value = elem.name;
	break;
      case "W":
	i = this.mWgtList.appendItem(elem.name);
	i.label = i.value = elem.name;
	break;
      }
      if (i) dd("Item added, label="+i.label+", value="+i.value);
    }, this);

    this.mAmpList.selectedIndex = 0;
    this.mPhiList.selectedIndex = 0;
    this.mWgtList.selectedIndex = 0;

    this.mPhiChk = document.getElementById("mtzopt-phichk");
    this.mWgtChk = document.getElementById("mtzopt-wgtchk");

    this.selectDefaultColumns();

    if (this.mAmpList.itemCount==0) {
      this.mAmpList.disabled = true;
    }
    if (this.mPhiList.itemCount==0) {
      this.mPhiChk.checked = false;
      this.mPhiChk.disabled = true;
    }
    if (this.mWgtList.itemCount==0) {
      this.mWgtChk.checked = false;
      this.mWgtChk.disabled = true;
    }

    this.mResoln = document.getElementById("mtzopt-resoln");
    this.mResoln.max = rdr.min_res;
    this.mResoln.min = rdr.max_res;
    this.mResoln.value = rdr.resolution;
    dd("Resoln min:"+this.mResoln.min+", max: "+this.mResoln.max+", val: "+this.mResoln.value);

    this.mGridList = document.getElementById("mtzopt-gridsize-list");
    util.selectMenuListByValue(this.mGridList, "0.25");

    this.updateDisabledState();
  }
  catch (e) {
    debug.exception(e);
  }
},

onDlgOk: function (aEvent)
{
  if (document.getElementById("mtzmap_options_tabpanel")) {
    try {
      let rdr = dlgdata.target[0].reader;
      rdr.clmn_F = this.mAmpList.selectedItem.value;
      if (this.mPhiChk.checked)
	rdr.clmn_PHI = this.mPhiList.selectedItem.value;
      else
	rdr.clmn_PHI = "";

      if (this.mWgtChk.checked)
	rdr.clmn_WT = this.mWgtList.selectedItem.value;
      else
	rdr.clmn_WT = "";

      let sval;
      if (this.mGridList.selectedItem)
	sval = this.mGridList.selectedItem.value;
      else
	sval = this.mGridList.inputField.value;
      sval = parseFloat(sval);
      if (isNaN(sval))
	rdr.gridsize = 1.0/3.0;
      else
	rdr.gridsize = sval;
      rdr.resolution = parseFloat(this.mResoln.value);
    }
    catch (e) {
      dd("Fopen MTZOptPage SetProp error: "+e);
      debug.exception(e);
    }
  }
},

contains: function (aName, aType)
{
  return this.mData.some( function (elem) {
    if (elem.name==aName && elem.type==aType) return true;
    else return false;
  });
},

selectDefaultColumns: function ()
{
  this.mPhiChk.checked = true;
  this.mWgtChk.checked = false;

  // PHENIX.REFINE
  if (this.contains("2FOFCWT", "F") &&
      this.contains("PH2FOFCWT", "P")) {
    util.selectMenuListByValue(this.mAmpList, "2FOFCWT");
    util.selectMenuListByValue(this.mPhiList, "PH2FOFCWT");
    return;
  }

  // REFMAC5
  if (this.contains("FWT", "F") &&
      this.contains("PHWT", "P")) {
    util.selectMenuListByValue(this.mAmpList, "FWT");
    util.selectMenuListByValue(this.mPhiList, "PHWT");
    return;
  }

  // SIGMAA
  if (this.contains("FWT", "F") &&
      this.contains("PHIC", "P")) {
    util.selectMenuListByValue(this.mAmpList, "FWT");
    util.selectMenuListByValue(this.mPhiList, "PHIC");
    return;
  }

  // RESOLVE
  if (this.contains("FP", "F") &&
      this.contains("PHIM", "P") &&
      this.contains("FOMM", "W")) {
    util.selectMenuListByValue(this.mAmpList, "FP");
    util.selectMenuListByValue(this.mPhiList, "PHIM");
    util.selectMenuListByValue(this.mWgtList, "FOMM");
    this.mWgtChk.checked = true;
    return;
  }

  // DM
  if (this.contains("FDM", "F") &&
      this.contains("PHIDM", "P") &&
      this.contains("FOMDM", "W")) {
    util.selectMenuListByValue(this.mAmpList, "FDM");
    util.selectMenuListByValue(this.mPhiList, "PHIDM");
    util.selectMenuListByValue(this.mWgtList, "FOMDM");
    this.mWgtChk.checked = true;
    return;
  }
},

updateDisabledState: function ()
{
  this.mPhiList.disabled = 
    (this.mPhiChk.checked) ? false : true ;

  this.mWgtList.disabled = 
    (this.mWgtChk.checked) ? false : true ;
}

}

dlgdata.ondlgok.push(function (event) { window.gMtzDlg.onDlgOk(event) });

addEventListener("load", function () { window.gMtzDlg.onInit() }, false);

} )();
  


