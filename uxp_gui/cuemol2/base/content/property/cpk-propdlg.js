// -*-Mode: C++;-*-
//
// dsurf-propdlg.js
//  DirectSurfRenderer Property Editor Page
//

// Make main page object
var gMain = new cuemolui.GenPropEdit();

// Make renderer-common-prop "page" object
var gComm = new cuemolui.RendCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

// Make radii-common-prop page
var gAtomRadii = new cuemolui.RadiiCommPage(gMain);
gMain.registerPage("atomradii-tab", gAtomRadii);

