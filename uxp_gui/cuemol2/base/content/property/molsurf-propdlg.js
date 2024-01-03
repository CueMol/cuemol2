// -*-Mode: C++;-*-
//
// molsurf-propdlg.js
//  MolSurfRenderer Property Editor Page
//

// Make main page object
var gMain = new cuemolui.GenPropEdit();

// Make renderer-common-prop "page" object
var gComm = new cuemolui.RendCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

// Make molsurf-common-prop page
var gMolSurf = new cuemolui.MolSurfCommPage(gMain);
gMain.registerPage("molsurf-tab", gMolSurf);

