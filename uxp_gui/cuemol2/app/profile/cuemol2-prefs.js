# -*- Mode: JavaScript; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

// XXX Toolkit-specific preferences should be moved into toolkit.js

#filter substitution

#
# SYNTAX HINTS:
#
#  - Dashes are delimiters; use underscores instead.
#  - The first character after a period must be alphabetic.
#  - Computed values (e.g. 50 * 1024) don't work.
#

#ifdef XP_UNIX
#ifndef XP_MACOSX
#define UNIX_BUT_NOT_MAC
#endif
#endif

pref("toolkit.defaultChromeURI","chrome://cuemol2/content/cuemol2.xul");
pref("browser.hiddenWindowChromeURL", "chrome://cuemol2/content/hiddenWindow.xul");

// Debug options
pref("browser.dom.window.dump.enabled", true);
pref("javascript.options.showInConsole", true);
pref("javascript.options.strict", true);
pref("nglayout.debug.disable_xul_cache", true);
pref("nglayout.debug.disable_xul_fastload", true); 
pref("dom.report_all_js_exceptions", true);

pref("cuemol2.debug.enable_dump", true);
pref("cuemol2.ui.view.use_hidpi", true);

#define AM_DOMAIN addons.palemoon.org
#define AM_AUS_ARGS reqVersion=%REQ_VERSION%&id=%ITEM_ID%&version=%ITEM_VERSION%&maxAppVersion=%ITEM_MAXAPPVERSION%&status=%ITEM_STATUS%&appID=%APP_ID%&appVersion=%APP_VERSION%&appOS=%APP_OS%&appABI=%APP_ABI%&locale=%APP_LOCALE%&currentAppVersion=%CURRENT_APP_VERSION%&updateType=%UPDATE_TYPE%&compatMode=%COMPATIBILITY_MODE%




// Dictionary download preference
pref("browser.dictionaries.download.url", "https://@AM_DOMAIN@/dictionaries/");

// Get More Tools link URL
pref("browser.getdevtools.url","https://@AM_DOMAIN@/?component=integration&type=external&request=devtools");

// Feedback URL
pref("browser.feedback.url", "https://forum.palemoon.org");

// Help button in slow startup dialog
pref("browser.slowstartup.help.url", "http://www.palemoon.org/support/slowstartup.shtml");

// Whether to escape to a content-less page if a user presses "Get me out of here"
// on a network error page (e.g. cert error)
pref("browser.escape_to_blank", false);

pref("app.update.enabled", false);

pref("xpinstall.whitelist.required", false);
// Allow installing XPI add-ons by direct URL requests (no referrer)
pref("xpinstall.whitelist.directRequest", true);
// Allow installing XPI add-ons from file referrers (chrome/file)
pref("xpinstall.whitelist.fileRequest", true);

pref("lightweightThemes.update.enabled", true);
pref("lightweightThemes.animation.enabled", false);

pref("keyword.enabled", true);

pref("general.useragent.locale", "@AB_CD@");
pref("general.skins.selectedSkin", "classic/1.0");

// Native UA mode by default for unbranded
pref("general.useragent.compatMode", 0);
pref("general.useragent.compatMode.gecko", false);
pref("general.useragent.compatMode.firefox", false);

pref("general.smoothScroll", true);
#ifdef UNIX_BUT_NOT_MAC
pref("general.autoScroll", false);
#else
pref("general.autoScroll", true);
#endif

pref("general.useragent.complexOverride.moodle", false); // bug 797703

// At startup, check if we're the default browser and prompt user if not.
pref("browser.shell.checkDefaultBrowser", true);
pref("browser.shell.shortcutFavicons",true);
pref("browser.shell.mostRecentDateSetAsDefault", "");
pref("browser.shell.skipDefaultBrowserCheckOnFirstRun", false);
pref("browser.shell.skipDefaultBrowserCheck", true);
pref("browser.shell.defaultBrowserCheckCount", 0);
pref("browser.defaultbrowser.notificationbar", false);

// 0 = blank, 1 = home (browser.startup.homepage), 2 = last visited page, 3 = resume previous browser session
// The behavior of option 3 is detailed at: http://wiki.mozilla.org/Session_Restore
pref("browser.startup.page",                1);
pref("browser.startup.homepage",            "chrome://branding/locale/browserconfig.properties");

pref("browser.slowStartup.notificationDisabled", false);
pref("browser.slowStartup.timeThreshold", 60000);
pref("browser.slowStartup.maxSamples", 5);

pref("browser.enable_automatic_image_resizing", true);
pref("browser.chrome.site_icons", true);
pref("browser.chrome.favicons", true);
// If enabled, will process favicons by drawing them on a canvas,
// optimizing display size for the UI. This also strips animations.
pref("browser.chrome.favicons.process", false);
// browser.warnOnQuit == false will override all other possible prompts when quitting or restarting
pref("browser.warnOnQuit", true);
// browser.showQuitWarning specifically controls the quit warning dialog. We
// might still show the window closing dialog with showQuitWarning == false.
pref("browser.showQuitWarning", false);
pref("browser.fullscreen.autohide", true);
pref("browser.fullscreen.animateUp", 1);
pref("browser.overlink-delay", 80);

pref("browser.urlbar.clickSelectsAll", true);
pref("browser.urlbar.doubleClickSelectsAll", false);
pref("browser.urlbar.autoFill", true);
pref("browser.urlbar.autoFill.typed", true);
// 0: Match anywhere (e.g., middle of words)
// 1: Match on word boundaries and then try matching anywhere
// 2: Match only on word boundaries (e.g., after / or .)
// 3: Match at the beginning of the url or title
pref("browser.urlbar.matchBehavior", 1);
pref("browser.urlbar.filter.javascript", true);

// the maximum number of results to show in autocomplete when doing richResults
pref("browser.urlbar.maxRichResults", 12);
// The amount of time (ms) to wait after the user has stopped typing
// before starting to perform autocomplete.  50 is the default set in
// autocomplete.xml.
pref("browser.urlbar.delay", 50);

// The special characters below can be typed into the urlbar to either restrict
// the search to visited history, bookmarked, tagged pages; or force a match on
// just the title text or url.
pref("browser.urlbar.restrict.history", "^");
pref("browser.urlbar.restrict.bookmark", "*");
pref("browser.urlbar.restrict.tag", "+");
pref("browser.urlbar.restrict.openpage", "%");
pref("browser.urlbar.restrict.typed", "~");
pref("browser.urlbar.match.title", "#");
pref("browser.urlbar.match.url", "@");

// The default behavior for the urlbar can be configured to use any combination
// of the match filters with each additional filter adding more results (union).
pref("browser.urlbar.suggest.history",              true);
pref("browser.urlbar.suggest.bookmark",             true);
pref("browser.urlbar.suggest.openpage",             true);

// Restrictions to current suggestions can also be applied (intersection).
// Typed suggestion works only if history is set to true.
pref("browser.urlbar.suggest.history.onlyTyped",    false);

pref("browser.urlbar.formatting.enabled", true);
pref("browser.urlbar.trimURLs", false);

// Display punycode in identity panel:
// 0 = Display IDN name
// 1 = Display punycode name for DV domains
// 2 = Also display punycode for HTTP sites if IDN name used
pref("browser.identity.display_punycode", 1);

// Address bar RSS icon control, show by default
pref("browser.urlbar.rss", true);

// If changed to true, copying the entire URL from the location bar will put
// the human readable (percent-decoded) URL on the clipboard.
pref("browser.urlbar.decodeURLsOnCopy", false);

pref("browser.altClickSave", true);

// Enable logging downloads operations to the Error Console.
pref("browser.download.debug", false);

// Number of milliseconds to wait for the http headers (and thus
// the Content-Disposition filename) before giving up and falling back to 
// picking a filename without that info in hand so that the user sees some
// feedback from their action.
pref("browser.download.saveLinkAsFilenameTimeout", 4000);

// Do not use default download location as standard, but ask.
pref("browser.download.useDownloadDir", false);

pref("browser.download.folderList", 1);
pref("browser.download.manager.showAlertOnComplete", true);
pref("browser.download.manager.showAlertInterval", 2000);
pref("browser.download.manager.retention", 2);
pref("browser.download.manager.showWhenStarting", true);
pref("browser.download.manager.closeWhenDone", false);
pref("browser.download.manager.focusWhenStarting", false);
pref("browser.download.manager.flashCount", 10);
pref("browser.download.manager.addToRecentDocs", true);
pref("browser.download.manager.quitBehavior", 2);
pref("browser.download.manager.scanWhenDone", true);
pref("browser.download.manager.resumeOnWakeDelay", 10000);

// This records whether or not the panel has been shown at least once.
pref("browser.download.panel.shown", false);

// This records whether or not at least one session with the Downloads Panel
// enabled has been completed already.
pref("browser.download.panel.firstSessionCompleted", false);

// search engines URL
pref("browser.search.searchEnginesURL",      "https://@AM_DOMAIN@/?component=integration&type=external&request=searchplugins");

// pointer to the default engine name
pref("browser.search.defaultenginename",      "chrome://browser-region/locale/region.properties");

// disable logging for the search service by default
pref("browser.search.log", false);

// Ordering of Search Engines in the Engine list. 
pref("browser.search.order.1",                "chrome://browser-region/locale/region.properties");
pref("browser.search.order.2",                "chrome://browser-region/locale/region.properties");
pref("browser.search.order.3",                "chrome://browser-region/locale/region.properties");
pref("browser.search.order.4",                "chrome://browser-region/locale/region.properties");

// search bar results always open in a new tab
pref("browser.search.openintab", false);

// do not swap focus to the context search tab.
pref("browser.search.context.loadInBackground", true);

// if no result, add the search term so that the panel of the new UI is shown anyway
pref("browser.search.showOneOffButtons", true);

// send ping to the server to update
pref("browser.search.update", true);

// disable logging for the search service update system by default
pref("browser.search.update.log", false);

// Check whether we need to perform engine updates every 6 hours
pref("browser.search.update.interval", 21600);

// enable search suggestions by default
pref("browser.search.suggest.enabled", true);

#ifdef MOZ_OFFICIAL_BRANDING
// {moz:official} expands to "official"
pref("browser.search.official", true);
#endif

pref("browser.sessionhistory.max_entries", 50);

// handle links targeting new windows
// 1=current window/tab, 2=new window, 3=new tab in most recent window
pref("browser.link.open_newwindow", 3);

// handle external links (i.e. links opened from a different application)
// default: use browser.link.open_newwindow
// 1-3: see browser.link.open_newwindow for interpretation
pref("browser.link.open_newwindow.override.external", -1);

// 0: no restrictions - divert everything
// 1: don't divert window.open at all
// 2: don't divert window.open with features
pref("browser.link.open_newwindow.restriction", 2);

// If true, this pref causes windows opened by window.open to be forced into new
// tabs (rather than potentially opening separate windows, depending on
// window.open arguments) when the browser is in fullscreen mode.
// We set this differently on Mac because the fullscreen implementation there is
// different.
#ifdef XP_MACOSX
pref("browser.link.open_newwindow.disabled_in_fullscreen", true);
#else
pref("browser.link.open_newwindow.disabled_in_fullscreen", false);
#endif

// Tabbed browser
pref("browser.tabs.autoHide", false);
pref("browser.tabs.closeWindowWithLastTab", true);
pref("browser.tabs.insertAllAfterCurrent", false);
pref("browser.tabs.insertRelatedAfterCurrent", true);
pref("browser.tabs.warnOnClose", true);
pref("browser.tabs.warnOnCloseOtherTabs", true);
pref("browser.tabs.warnOnOpen", true);
pref("browser.tabs.maxOpenBeforeWarn", 15);
pref("browser.tabs.loadInBackground", true);
pref("browser.tabs.opentabfor.middleclick", true);
pref("browser.tabs.loadDivertedInBackground", false);
pref("browser.tabs.loadBookmarksInBackground", false);
pref("browser.tabs.noWindowActivationOnExternal", false);
pref("browser.tabs.tabClipWidth", 140);
pref("browser.tabs.animate", true);
pref("browser.tabs.onTop", false);
#ifdef XP_WIN
pref("browser.tabs.drawInTitlebar", true);
#else
pref("browser.tabs.drawInTitlebar", false);
#endif
pref("browser.tabs.resize_immediately", false);

// Where to show tab close buttons:
// 0  on active tab only
// 1  on all tabs until tabClipWidth is reached, then active tab only
// 2  no close buttons at all
// 3  at the end of the tabstrip
pref("browser.tabs.closeButtons", 1);

// When tabs opened by links in other tabs via a combination of 
// browser.link.open_newwindow being set to 3 and target="_blank" etc are
// closed:
// true   return to the tab that opened this tab (its owner)
// false  return to the adjacent tab (old default)
pref("browser.tabs.selectOwnerOnClose", true);

pref("browser.tabs.showAudioPlayingIcon", true);
// This should match Chromium's audio indicator delay.
pref("browser.tabs.delayHidingAudioPlayingIconMS", 3000);

// Whether dragging a tab off the tab bar to tear it off into its own
// window is enabled.
pref("browser.tabs.allowTabDetach", true);

// Whether to fade tab labels instead of using ellipses when cutting off
// long page titles.
pref("browser.tabs.fadeLabels", true);

pref("browser.allTabs.previews", true);
pref("browser.allTabs.hidePinnedTabs", false);
pref("browser.ctrlTab.previews", true);
pref("browser.ctrlTab.hidePinnedTabs", false);
pref("browser.ctrlTab.recentlyUsedLimit", 7);

// By default, do not export HTML at shutdown.
// If true, at shutdown the bookmarks in your menu and toolbar will
// be exported as HTML to the bookmarks.html file.
pref("browser.bookmarks.autoExportHTML",          false);

// The maximum number of daily bookmark backups to 
// keep in {PROFILEDIR}/bookmarkbackups. Special values:
// -1: unlimited
//  0: no backups created (and deletes all existing backups)
pref("browser.bookmarks.max_backups",             10);

// Scripts & Windows prefs
pref("dom.disable_open_during_load",              true);
pref("javascript.options.showInConsole",          true);
#ifdef DEBUG
pref("general.warnOnAboutConfig",                 false);
#endif

// This is the pref to control the location bar, change this to true to 
// force this - this makes the origin of popup windows more obvious to avoid
// spoofing. We would rather not do it by default because it affects UE for web
// applications, but without it there isn't a really good way to prevent chrome
// spoofing, see bug 337344
pref("dom.disable_window_open_feature.location",  true);
// Allow JS to set status messages
pref("dom.disable_window_status_change",          false);
// allow JS to move and resize existing windows
pref("dom.disable_window_move_resize",            false);
// prevent JS from monkeying with window focus, etc
pref("dom.disable_window_flip",                   true);

// Disable touch events on Desktop Firefox by default until they are properly
// supported (bug 736048)
pref("dom.w3c_touch_events.enabled",        0);

// Whether performance.GetEntries* will contain an entry for the active document
// Disabled by default in Pale Moon (unlike in UXP) since it can be used for
// tracking/profiling.
pref("dom.enable_performance_navigation_timing", false);

// popups.policy 1=allow,2=reject
pref("privacy.popups.policy",               1);
pref("privacy.popups.usecustom",            true);
pref("privacy.popups.showBrowserMessage",   true);

pref("privacy.item.cookies",                false);

pref("privacy.clearOnShutdown.history",     true);
pref("privacy.clearOnShutdown.formdata",    true);
pref("privacy.clearOnShutdown.passwords",   false);
pref("privacy.clearOnShutdown.downloads",   true);
pref("privacy.clearOnShutdown.cookies",     true);
pref("privacy.clearOnShutdown.cache",       true);
pref("privacy.clearOnShutdown.sessions",    true);
pref("privacy.clearOnShutdown.offlineApps", false);
pref("privacy.clearOnShutdown.siteSettings", false);
pref("privacy.clearOnShutdown.connectivityData", false);

pref("privacy.cpd.history",                 true);
pref("privacy.cpd.formdata",                true);
pref("privacy.cpd.passwords",               false);
pref("privacy.cpd.downloads",               true);
pref("privacy.cpd.cookies",                 true);
pref("privacy.cpd.cache",                   true);
pref("privacy.cpd.sessions",                true);
pref("privacy.cpd.offlineApps",             false);
pref("privacy.cpd.siteSettings",            false);
pref("privacy.cpd.connectivityData",        false);

// What default should we use for the time span in the sanitizer:
// 0 - Clear everything
// 1 - Last Hour
// 2 - Last 2 Hours
// 3 - Last 4 Hours
// 4 - Today
pref("privacy.sanitize.timeSpan", 1);
pref("privacy.sanitize.sanitizeOnShutdown", false);

pref("privacy.sanitize.migrateFx3Prefs",    false);

pref("network.proxy.share_proxy_settings",  false); // use the same proxy settings for all protocols

// Disable speculative half-open connections on Pale Moon
pref("network.http.speculative-parallel-limit", 0);

// Enable pipelining over SSL
pref("network.http.pipelining.ssl", true);

// Disable predictor/prefetch of URIs
pref("network.predictor.enabled", false);
pref("network.prefetch-next", false);

// Disable DNS prefetching
pref("network.dns.disablePrefetch", true);

// Tune DNS lookups
pref("network.dnsCacheEntries", 800);
pref("network.dnsCacheExpiration", 180);            // 3 minutes if no TTL given by DNS resolver
pref("network.dns.get-ttl", true);                  // Get and use DNS resolver TTL
pref("network.dnsCacheExpirationGracePeriod", 60);  // 1 minute grace period for stale entry

// simple gestures support
pref("browser.gesture.swipe.left", "Browser:BackOrBackDuplicate");
pref("browser.gesture.swipe.right", "Browser:ForwardOrForwardDuplicate");
pref("browser.gesture.swipe.up", "cmd_scrollTop");
pref("browser.gesture.swipe.down", "cmd_scrollBottom");
#ifdef XP_MACOSX
pref("browser.gesture.pinch.latched", true);
pref("browser.gesture.pinch.threshold", 150);
#else
pref("browser.gesture.pinch.latched", false);
pref("browser.gesture.pinch.threshold", 25);
#endif
#ifdef XP_WIN
// Enabled for touch input display zoom.
pref("browser.gesture.pinch.out", "cmd_fullZoomEnlarge");
pref("browser.gesture.pinch.in", "cmd_fullZoomReduce");
pref("browser.gesture.pinch.out.shift", "cmd_fullZoomReset");
pref("browser.gesture.pinch.in.shift", "cmd_fullZoomReset");
#else
// Disabled by default due to issues with track pad input.
pref("browser.gesture.pinch.out", "");
pref("browser.gesture.pinch.in", "");
pref("browser.gesture.pinch.out.shift", "");
pref("browser.gesture.pinch.in.shift", "");
#endif
pref("browser.gesture.twist.latched", false);
pref("browser.gesture.twist.threshold", 0);
pref("browser.gesture.twist.right", "cmd_gestureRotateRight");
pref("browser.gesture.twist.left", "cmd_gestureRotateLeft");
pref("browser.gesture.twist.end", "cmd_gestureRotateEnd");
pref("browser.gesture.tap", "cmd_fullZoomReset");

pref("browser.snapshots.limit", 0);

// 0: Nothing happens
// 1: Scroll contents
// 2: Go back or go forward, in your history
// 3: Zoom in or out
// 4: Scroll contents with X and Y swapped
#ifdef XP_MACOSX
// On OS X, if the wheel has one axis only, shift+wheel comes through as a
// horizontal scroll event. Thus, we can't assign anything other than normal
// scrolling to shift+wheel.
pref("mousewheel.with_alt.action", 2);
pref("mousewheel.with_shift.action", 1);
// On MacOS X, control+wheel is typically handled by system and we don't
// receive the event.  So, command key which is the main modifier key for
// acceleration is the best modifier for zoom-in/out.  However, we should keep
// the control key setting for backward compatibility.
pref("mousewheel.with_meta.action", 3); // command key on Mac
// Disable control-/meta-modified horizontal mousewheel events, since
// those are used on Mac as part of modified swipe gestures (e.g.
// Left swipe+Cmd = go back in a new tab).
pref("mousewheel.with_control.action.override_x", 0);
pref("mousewheel.with_meta.action.override_x", 0);
#else
pref("mousewheel.with_alt.action", 1);
pref("mousewheel.with_shift.action", 2);
pref("mousewheel.with_meta.action", 1); // win key on Win, Super/Hyper on Linux
#endif
pref("mousewheel.with_control.action",3);
pref("mousewheel.with_win.action", 1);

pref("browser.xul.error_pages.enabled", true);
pref("browser.xul.error_pages.expert_bad_cert", false);

// Work Offline is best manually managed by the user.
pref("network.manage-offline-status", false);

// We want to make sure mail URLs are handled externally...
pref("network.protocol-handler.external.mailto", true); // for mail
pref("network.protocol-handler.external.news", true);   // for news
pref("network.protocol-handler.external.snews", true);  // for secure news
pref("network.protocol-handler.external.nntp", true);   // also news
#ifdef XP_WIN
pref("network.protocol-handler.external.ms-windows-store", true);
#endif

// ...without warning dialogs
pref("network.protocol-handler.warn-external.mailto", false);
pref("network.protocol-handler.warn-external.news", false);
pref("network.protocol-handler.warn-external.snews", false);
pref("network.protocol-handler.warn-external.nntp", false);
#ifdef XP_WIN
pref("network.protocol-handler.warn-external.ms-windows-store", false);
#endif

// By default, all protocol handlers are exposed.  This means that
// the browser will respond to openURL commands for all URL types.
// It will also try to open link clicks inside the browser before
// failing over to the system handlers.
pref("network.protocol-handler.expose-all", true);
pref("network.protocol-handler.expose.mailto", false);
pref("network.protocol-handler.expose.news", false);
pref("network.protocol-handler.expose.snews", false);
pref("network.protocol-handler.expose.nntp", false);

pref("accessibility.typeaheadfind", false);
pref("accessibility.typeaheadfind.timeout", 5000);
pref("accessibility.typeaheadfind.linksonly", false);
pref("accessibility.typeaheadfind.flashBar", 1);

// by default we show an infobar message when pages require plugins that are blocked, or are outdated
pref("plugins.hide_infobar_for_blocked_plugin", false);
pref("plugins.hide_infobar_for_outdated_plugin", false);

// Pale Moon:pref to always show the plugin indicator or not (default=false)
pref("plugins.always_show_indicator", false);

//Enable tri-state option (Always/Never/Ask)
pref("plugins.click_to_play", true);

// Platform pref is to enable all plugins by default.
// Uncomment this pref to default to click-to-play
// pref("plugin.default.state", 1);

// Don't load plugin instances with no src declared.
// These prefs are documented in detail in all.js.
pref("plugins.favorfallback.mode", "follow-ctp");
pref("plugins.favorfallback.rules", "nosrc");

#ifdef XP_WIN
pref("browser.preferences.instantApply", false);
#else
pref("browser.preferences.instantApply", true);
#endif
#ifdef XP_MACOSX
pref("browser.preferences.animateFadeIn", true);
#else
pref("browser.preferences.animateFadeIn", false);
#endif

pref("browser.download.show_plugins_in_list", true);
pref("browser.download.hide_plugins_without_extensions", true);

// Backspace and Shift+Backspace behavior
// 0 goes Back/Forward
// 1 act like PgUp/PgDown
// 2 and other values, nothing
#ifdef UNIX_BUT_NOT_MAC
pref("browser.backspace_action", 2);
#else
pref("browser.backspace_action", 0);
#endif

// Pale Moon never eats the space with word selection, regardless of O.S.
pref("layout.word_select.eat_space_to_next_word", false);

// this will automatically enable inline spellchecking (if it is available) for
// editable elements in HTML
// 0 = spellcheck nothing
// 1 = check multi-line controls [default]
// 2 = check multi/single line controls
pref("layout.spellcheckDefault", 1);

pref("browser.send_pings", false);

/* initial web feed readers list */
pref("browser.contentHandlers.types.0.title", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.0.uri", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.0.type", "application/vnd.mozilla.maybe.feed");
pref("browser.contentHandlers.types.1.title", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.1.uri", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.1.type", "application/vnd.mozilla.maybe.feed");
pref("browser.contentHandlers.types.2.title", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.2.uri", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.2.type", "application/vnd.mozilla.maybe.feed");
pref("browser.contentHandlers.types.3.title", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.3.uri", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.3.type", "application/vnd.mozilla.maybe.feed");
pref("browser.contentHandlers.types.4.title", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.4.uri", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.4.type", "application/vnd.mozilla.maybe.feed");
pref("browser.contentHandlers.types.5.title", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.5.uri", "chrome://browser-region/locale/region.properties");
pref("browser.contentHandlers.types.5.type", "application/vnd.mozilla.maybe.feed");

pref("browser.feeds.handler", "ask");
pref("browser.videoFeeds.handler", "ask");
pref("browser.audioFeeds.handler", "ask");

// At startup, if the handler service notices that the version number in the
// region.properties file is newer than the version number in the handler
// service datastore, it will add any new handlers it finds in the prefs (as
// seeded by this file) to its datastore.  
pref("gecko.handlerService.defaultHandlersVersion", "chrome://browser-region/locale/region.properties");

// The default set of web-based protocol handlers shown in the application
// selection dialog for webcal: ; I've arbitrarily picked 4 default handlers
// per protocol, but if some locale wants more than that (or defaults for some
// protocol not currently listed here), we should go ahead and add those.

// webcal
pref("gecko.handlerService.schemes.webcal.0.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.webcal.0.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.webcal.1.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.webcal.1.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.webcal.2.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.webcal.2.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.webcal.3.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.webcal.3.uriTemplate", "chrome://browser-region/locale/region.properties");

// mailto
pref("gecko.handlerService.schemes.mailto.0.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.mailto.0.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.mailto.1.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.mailto.1.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.mailto.2.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.mailto.2.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.mailto.3.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.mailto.3.uriTemplate", "chrome://browser-region/locale/region.properties");

// irc
pref("gecko.handlerService.schemes.irc.0.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.irc.0.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.irc.1.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.irc.1.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.irc.2.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.irc.2.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.irc.3.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.irc.3.uriTemplate", "chrome://browser-region/locale/region.properties");

// ircs
pref("gecko.handlerService.schemes.ircs.0.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.ircs.0.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.ircs.1.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.ircs.1.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.ircs.2.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.ircs.2.uriTemplate", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.ircs.3.name", "chrome://browser-region/locale/region.properties");
pref("gecko.handlerService.schemes.ircs.3.uriTemplate", "chrome://browser-region/locale/region.properties");

// By default, we don't want protocol/content handlers to be registered from a different host, see bug 402287
pref("gecko.handlerService.allowRegisterFromDifferentHost", false);

pref("browser.geolocation.warning.infoURL", "http://www.palemoon.org/info-url/geolocation.shtml");
pref("browser.mixedcontent.warning.infoURL", "http://www.palemoon.org/info-url/mixedcontent.shtml");
pref("browser.push.warning.infoURL", "https://www.palemoon.org/info-url/push.shtml");

pref("browser.EULA.version", 3);
pref("browser.rights.version", 3);
pref("browser.rights.3.shown", false);

#ifdef DEBUG
// Don't show the about:rights notification in debug builds.
pref("browser.rights.override", true);
#endif

pref("browser.sessionstore.resume_from_crash", true);
pref("browser.sessionstore.resume_session_once", false);

// minimal interval between two save operations in milliseconds
pref("browser.sessionstore.interval",60000);
// maximum amount of POSTDATA to be saved in bytes per history entry (-1 = all of it)
// (NB: POSTDATA will be saved either entirely or not at all)
pref("browser.sessionstore.postdata", 0);
// on which sites to save text data, POSTDATA and cookies
// 0 = everywhere, 1 = unencrypted sites, 2 = nowhere
pref("browser.sessionstore.privacy_level", 0);
// the same as browser.sessionstore.privacy_level, but for saving deferred session data
pref("browser.sessionstore.privacy_level_deferred", 1);
// how many tabs can be reopened (per window)
pref("browser.sessionstore.max_tabs_undo", 10);
// how many windows can be reopened (per session) - on non-OS X platforms this
// pref may be ignored when dealing with pop-up windows to ensure proper startup
pref("browser.sessionstore.max_windows_undo", 3);
// number of crashes that can occur before the about:sessionrestore page is displayed
// (this pref has no effect if more than 6 hours have passed since the last crash)
pref("browser.sessionstore.max_resumed_crashes", 1);
// number of back button session history entries to save (-1 = all of them)
pref("browser.sessionstore.max_serialize_back", 10);
// number of forward button session history entries to save (-1 = all of them)
pref("browser.sessionstore.max_serialize_forward", -1);
// restore_on_demand overrides browser.sessionstore.max_concurrent_tabs
// and restore_hidden_tabs. When true, tabs will not be restored until they are
// focused (also applies to tabs that aren't visible). When false, the values
// for browser.sessionstore.max_concurrent_tabs and restore_hidden_tabs are 
// respected. Selected tabs are always restored regardless of this pref.
pref("browser.sessionstore.restore_on_demand", true);
// The number of tabs that can restore concurrently.
// Sane values are 1..10, default 3.
pref("browser.sessionstore.max_concurrent_tabs", 3);
// Whether to automatically restore hidden tabs (i.e., tabs in other tab groups) or not
pref("browser.sessionstore.restore_hidden_tabs", false);
// If restore_on_demand is set, pinned tabs are restored on startup by default.
// When set to true, this pref overrides that behavior, and pinned tabs will only
// be restored when they are focused.
pref("browser.sessionstore.restore_pinned_tabs_on_demand", false);
// Pale Moon: Allow the user to bypass cached versions of pages when restoring
// tabs from a previous session
// 0 = pull fully from cache
// 1 = perform a soft refresh when restoring a tab (check network)
// 2 = perform a hard refresh when restoring a tab (bypass cache completely)
pref("browser.sessionstore.cache_behavior", 0);
// Pale Moon: Allow exact positioning of windows to previous locations, even
// if they would be outside of the screen bounds
pref("browser.sessionstore.exactPos", false);

// allow META refresh by default
pref("accessibility.blockautorefresh", false);

// Whether history is enabled or not.
pref("places.history.enabled", true);

// the (maximum) number of the recent visits to sample
// when calculating frecency
pref("places.frecency.numVisits", 10);

// buckets (in days) for frecency calculation
pref("places.frecency.firstBucketCutoff", 4);
pref("places.frecency.secondBucketCutoff", 14);
pref("places.frecency.thirdBucketCutoff", 31);
pref("places.frecency.fourthBucketCutoff", 90);

// weights for buckets for frecency calculations
pref("places.frecency.firstBucketWeight", 100);
pref("places.frecency.secondBucketWeight", 70);
pref("places.frecency.thirdBucketWeight", 50);
pref("places.frecency.fourthBucketWeight", 30);
pref("places.frecency.defaultBucketWeight", 10);

// bonus (in percent) for visit transition types for frecency calculations
pref("places.frecency.embedVisitBonus", 0);
pref("places.frecency.framedLinkVisitBonus", 0);
pref("places.frecency.linkVisitBonus", 100);
pref("places.frecency.typedVisitBonus", 2000);
pref("places.frecency.bookmarkVisitBonus", 75);
pref("places.frecency.downloadVisitBonus", 0);
pref("places.frecency.permRedirectVisitBonus", 0);
pref("places.frecency.tempRedirectVisitBonus", 0);
pref("places.frecency.defaultVisitBonus", 0);

// bonus (in percent) for place types for frecency calculations
pref("places.frecency.unvisitedBookmarkBonus", 140);
pref("places.frecency.unvisitedTypedBonus", 200);

// Controls behavior of the "Add Exception" dialog launched from SSL error pages
// 0 - don't pre-populate anything
// 1 - pre-populate site URL, but don't fetch certificate
// 2 - pre-populate site URL and pre-fetch certificate
pref("browser.ssl_override_behavior", 2);

// Controls the behavior of data storage for offline apps
// 0 - Deny storage of offline app data without prompting (breaks sites!)
// 1 - Ask the user if a website wants to store offline app data
// 2 - Allow storage of offline app data without prompting (default)
pref("offline-apps.permissions", 2);
// True if storage of offline app data is allowed without prompting.
pref("offline-apps.allow_by_default", true);
// True if the user should be prompted when a web application supports
// offline apps.
pref("browser.offline-apps.notify", true);

// if true, use full page zoom instead of text zoom
pref("browser.zoom.full", true);

// Whether or not to save and restore zoom levels on a per-site basis.
pref("browser.zoom.siteSpecific", true);

// Whether or not to update background tabs to the current zoom level.
pref("browser.zoom.updateBackgroundTabs", true);

// base URL for web-based support pages
pref("app.support.baseURL", "http://www.palemoon.org/support/");

// Name of alternate about: page for certificate errors (when undefined, defaults to about:neterror)
pref("security.alternate_certificate_error_page", "certerror");

// Whether to start the private browsing mode at application startup
pref("browser.privatebrowsing.autostart", false);

// Whether to immediately open the bookmark edit panel for new bookmarks
pref("browser.bookmarks.editDialog.showForNewBookmarks", false);

// Don't try to alter this pref, it'll be reset the next time you use the
// bookmarking dialog
pref("browser.bookmarks.editDialog.firstEditField", "namePicker");

// Prompt for master password on application startup?
pref("signon.startup.prompt", false);

// Whether to use a panel that looks like an OS X sheet for customization
#ifdef XP_MACOSX
pref("toolbar.customization.usesheet", true);
#else
pref("toolbar.customization.usesheet", false);
#endif

#ifdef XP_MACOSX
// On mac, the default pref is per-architecture
pref("dom.ipc.plugins.enabled.i386", true);
pref("dom.ipc.plugins.enabled.x86_64", true);
#else
pref("dom.ipc.plugins.enabled", true);
#endif

// This pref governs whether we attempt to work around problems caused by
// plugins using OS calls to manipulate the cursor while running out-of-
// process.  These workarounds all involve intercepting (hooking) certain
// OS calls in the plugin process, then arranging to make certain OS calls
// in the browser process.  Eventually plugins will be required to use the
// NPAPI to manipulate the cursor, and these workarounds will be removed.
// See bug 621117.
#ifdef XP_MACOSX
pref("dom.ipc.plugins.nativeCursorSupport", true);
#endif

#ifdef XP_WIN
pref("browser.taskbar.previews.enable", false);
pref("browser.taskbar.previews.max", 20);
pref("browser.taskbar.previews.cachetime", 5);
pref("browser.taskbar.lists.enabled", true);
pref("browser.taskbar.lists.frequent.enabled", true);
pref("browser.taskbar.lists.recent.enabled", false);
pref("browser.taskbar.lists.maxListItemCount", 7);
pref("browser.taskbar.lists.tasks.enabled", true);
pref("browser.taskbar.lists.refreshInSeconds", 120);
#endif

// Enable the error console
pref("devtools.errorconsole.enabled", true);

// Whether the character encoding menu is under the main Firefox button. This
// preference is a string so that localizers can alter it.
pref("browser.menu.showCharacterEncoding", "chrome://browser/locale/browser.properties");

// Allow using tab-modal prompts when possible.
pref("prompts.tab_modal.enabled", true);
// Allow tab-modal prompts to switch tab focus
pref("prompts.tab_modal.focusSwitch", true);

// Defines the url to be used for new tabs.
pref("browser.newtab.url", "about:logopage");
pref("browser.newtab.choice", 1);

// Activates preloading of the new tab url.
pref("browser.newtab.preload", false);

// Toggles the content of 'about:newtab'. Shows the grid when enabled.
pref("browser.newtabpage.enabled", true);

// Disables capturing of page thumbnails
pref("browser.pagethumbnails.capturing_disabled", false);

// enables showing basic placeholders for missing thumbnails
pref("browser.newtabpage.thumbnailPlaceholder", false);

// number of columns of newtab grid
pref("browser.newtabpage.columns", 4);

// number of rows of newtab grid
pref("browser.newtabpage.rows", 3);

// Enable the DOM fullscreen API.
pref("full-screen-api.enabled", true);

// about:permissions
// Maximum number of sites to return from the places database.
// 0-100 (currently)
pref("permissions.places-sites-limit", 50);

// Built-in default permissions.
pref("permissions.manager.defaultsUrl", "resource://app/defaults/permissions");

// Startup Crash Tracking
// number of startup crashes that can occur before starting into safe mode automatically
// (this pref has no effect if more than 6 hours have passed since the last crash)
pref("toolkit.startup.max_resumed_crashes", -1);

// The maximum amount of decoded image data we'll willingly keep around (we
// might keep around more than this, but we'll try to get down to this value).
// (This is intentionally on the high side; see bug 746055.)
pref("image.mem.max_decoded_image_kb", 256000);

// Turn on the CSP 1.0 parser for Content Security Policy headers
pref("security.csp.speccompliant", true);

// Block insecure active content on https pages
pref("security.mixed_content.block_active_content", true);

// Disable Microsoft Family Safety MitM support
pref("security.family_safety.mode", 0);

// Override the Gecko-default value of false for Pale Moon.
pref("plain_text.wrap_long_lines", true);

pref("media.webaudio.enabled", true);

// If this turns true, Moz*Gesture events are not called stopPropagation()
// before content.
pref("dom.debug.propagate_gesture_events_through_content", false);

// The request URL of the GeoLocation backend.
pref("geo.wifi.uri", "http://ip-api.com/json/?fields=lat,lon,status,message");

//Pale Moon padlock overlay preferences
pref("browser.padlock.shown", true);
/* Where to show the padlock
   1 = inside identity button, right side
   2 = inside identity button, left side
   3 = urlbar, right side (next to bookmark star)
   4 = statusbar
   5 = tabs bar, right side 
   6-10 = same locations, classic style padlock */
pref("browser.padlock.style", 1);
// address bar border, 0 = no border, 1 = border, 2 = border only on secure sites
pref("browser.padlock.urlbar_background", 2);

//Pale Moon standalone image background color
pref("browser.display.standalone_images.background_color", "#2E3B41");

// These are the thumbnail width/height set in about:newtab.
// If you change this, make sure the size is sufficient for tile sizes
// in about:newtab. These values are in CSS pixels.
pref("toolkit.pageThumbs.minWidth", 250);
pref("toolkit.pageThumbs.minHeight", 180);

// On GTK, we now default to showing the menubar only when alt is pressed:
#ifdef MOZ_WIDGET_GTK
pref("ui.key.menuAccessKeyFocuses", true);
#endif

// When a user cancels this number of authentication dialogs coming from
// a single web page (eTLD+1) in a row, all following authentication dialogs
// will be blocked (automatically canceled) for that page.
// This counter is per-tab and per-domain to minimize false positives.
// The counter resets when the page is reloaded from the UI
// (content-reloads do NOT clear this to mitigate reloading tricks).
pref("prompts.authentication_dialog_abuse_limit", 3);
