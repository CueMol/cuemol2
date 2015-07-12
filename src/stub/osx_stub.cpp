//
//
//

#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <errno.h>
#include <limits.h>
// #include <common.h>

#define XPCOM_GLUE 1

#include <nsXPCOMGlue.h>
#include <nsCOMPtr.h>
#include <nsStringAPI.h>
#include <nsILocalFile.h>
#include <nsXULAppAPI.h>
//#include "stub_common.hpp"

// OS X specific include files:
#include <CoreFoundation/CoreFoundation.h>

#define MAXPATHLEN PATH_MAX

XRE_CreateAppDataType XRE_CreateAppData;
XRE_FreeAppDataType XRE_FreeAppData;
XRE_mainType XRE_main;

/////////

int main(int argc, char **argv)
{
  nsresult rv;
  char *lastSlash;

  char iniPath[MAXPATHLEN];
  char tmpPath[MAXPATHLEN];
  char greDir[MAXPATHLEN];
  bool greFound = false;

  CFBundleRef appBundle = CFBundleGetMainBundle();
  if (!appBundle)
    return 1;

  CFURLRef resourcesURL = CFBundleCopyResourcesDirectoryURL(appBundle);
  if (!resourcesURL)
    return 1;

  CFURLRef absResourcesURL = CFURLCopyAbsoluteURL(resourcesURL);
  CFRelease(resourcesURL);
  if (!absResourcesURL)
    return 1;

  CFURLRef iniFileURL =
    CFURLCreateCopyAppendingPathComponent(kCFAllocatorDefault,
                                          absResourcesURL,
                                          CFSTR("application.ini"),
                                          false);
  CFRelease(absResourcesURL);
  if (!iniFileURL)
    return 1;

  CFStringRef iniPathStr =
    CFURLCopyFileSystemPath(iniFileURL, kCFURLPOSIXPathStyle);
  CFRelease(iniFileURL);
  if (!iniPathStr)
    return 1;

  CFStringGetCString(iniPathStr, iniPath, sizeof(iniPath),
                     kCFStringEncodingUTF8);
  CFRelease(iniPathStr);

  printf("iniPath = %s\n", iniPath);

  ////////////////////////////////////////

  // Check for <bundle>/Contents/Frameworks/XUL.framework/libxpcom.dylib
  //CFURLRef fwurl = CFBundleCopyPrivateFrameworksURL(appBundle);
  CFURLRef exurl = CFBundleCopyExecutableURL(appBundle);
  CFURLRef absexurl = nullptr;
  if (exurl) {
    absexurl = CFURLCopyAbsoluteURL(exurl);
    CFRelease(exurl);
  }
  
  char tbuffer[MAXPATHLEN];
  
  CFURLGetFileSystemRepresentation(absexurl, true,
				   (UInt8*) tbuffer,
				   sizeof(tbuffer));
  printf("abs exe url = %s\n", tbuffer);
  CFRelease(absexurl);

  //snprintf(greDir, sizeof(greDir), "%s/XUL.framework/Versions/Current/xulrunner", tbuffer);
  snprintf(greDir, sizeof(greDir), "%s", tbuffer);
  //if (realpath(tbuffer, greDir)) {
  //greFound = true;
  //}

  printf("greDir = %s\n", greDir);
  if (access(greDir, R_OK | X_OK) == 0)
    greFound = true;

  if (!greFound) {
    printf("Could not find the Mozilla runtime.\n");
    return 1;
  }

  rv = XPCOMGlueStartup(greDir);

  if (NS_FAILED(rv)) {
    printf("Couldn't load XPCOM.\n");
    return 1;
  }

  printf("Glue startup OK.\n");

  /////////////////////////////////////////////////////

  static const nsDynamicFunctionLoad kXULFuncs[] = {
    { "XRE_CreateAppData", (NSFuncPtr*) &XRE_CreateAppData },
    { "XRE_FreeAppData", (NSFuncPtr*) &XRE_FreeAppData },
    { "XRE_main", (NSFuncPtr*) &XRE_main },
    { nullptr, nullptr }
  };

  rv = XPCOMGlueLoadXULFunctions(kXULFuncs);
  if (NS_FAILED(rv)) {
    printf("Couldn't load XRE functions.\n");
    return 1;
  }

  NS_LogInit();

  int retval;

  nsXREAppData *pAppData = NULL;
  {
    nsCOMPtr<nsIFile> iniFile;
    // nsIFile *pIniFile;
    rv = NS_NewNativeLocalFile(nsDependentCString(iniPath), PR_FALSE,
			       getter_AddRefs(iniFile));
                               //&pIniFile);
    //NS_ADDREF(pIniFile);
    if (NS_FAILED(rv)) {
      printf("Couldn't find application.ini file.\n");
      return 1;
    }

    rv = XRE_CreateAppData(iniFile, &pAppData);
    //rv = XRE_CreateAppData(pIniFile, &pAppData);
    if (NS_FAILED(rv)) {
      printf("Error: couldn't parse application.ini.\n");
      return 1;
    }
  }

  NS_ASSERTION(pAppData->directory, "Failed to get app directory.");

  if (!pAppData->xreDirectory) {
    // chop "xulrunner" off the GRE path
    char *lastSlash = strrchr(greDir, '/');
    if (lastSlash) {
      *lastSlash = '\0';
    }
    printf("xreDir: %s.\n", greDir);
    NS_NewNativeLocalFile(nsDependentCString(greDir), PR_FALSE,
                          &pAppData->xreDirectory);
  }
  
  printf("### ENTERING XRE_MAIN ###\n");

  retval = XRE_main(argc, argv, pAppData, 0);

  printf("### LEAVING XRE_MAIN ###\n");

  NS_LogTerm();

  return retval;
}
