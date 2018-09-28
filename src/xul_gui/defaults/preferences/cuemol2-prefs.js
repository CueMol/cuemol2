pref("toolkit.defaultChromeURI", "chrome://cuemol2/content/cuemol2.xul");
// pref("toolkit.singletonWindowType", "cuemol2");
pref("general.useragent.extra.cuemol2", "CueMol2/2.0");

pref("plugin.scan.plid.all", false);
pref("dom.max_script_run_time", 0); 
pref("dom.max_chrome_script_run_time", 0); 
//pref("plugin.scan.Acrobat", false);
//pref("plugin.scan.Quicktime", false);
//pref("plugin.scan.WindowsMediaPlayer", false);

pref("general.useragent.locale", "en-US");
//pref("general.useragent.locale", "ja");

// for prefwindow OK/CANCEL buttons (MacOSX)
pref("browser.preferences.instantApply", false);

// file picker ?? (MacOSX)
//pref("filepicker.showHiddenFiles", true);

// application update system
pref("app.update.url", "http://www.cuemol.org/aus/update.php/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%OS_VERSION%/update.xml");
pref("app.update.url.manual", "http://www.cuemol.org/");
pref("app.update.url.details", "http://www.cuemol.org/%LOCALE%/%APP%/releases/");

// http protocol handling (by external web browser)
pref("network.protocol-handler.warn-external.http", false);
pref("network.protocol-handler.warn-external.https", false);
pref("network.protocol-handler.warn-external.ftp", false);
//pref("network.protocol-handler.expose-all", false);

pref("webgl.force-enabled", true);

// pref("cuemol2.ui.mouse-momentum-scroll", true);

// Needed due to https://bugzilla.mozilla.org/show_bug.cgi?id=1181977
pref("browser.hiddenWindowChromeURL", "chrome://cuemol2/content/hiddenWindow.xul");

// Use GL shader by default
pref("cuemol2.ui.view.use_gl_shader", true); 

