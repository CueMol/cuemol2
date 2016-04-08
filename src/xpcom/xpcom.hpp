//
// XPCOM-related include files
//

#ifdef WINVER
#  undef WINVER
#endif

#ifdef _WIN32_IE
#  undef _WIN32_IE
#endif

#ifdef _WIN32_WINNT
#  undef _WIN32_WINNT
#endif

#ifdef _X86_
#  undef _X86_
#endif

#include <mozilla/Char16.h>
#include <nsCOMPtr.h>
#include <nsMemory.h>
#include <nsISupportsUtils.h>
#include <nsServiceManagerUtils.h>
#include <nsComponentManagerUtils.h>

#ifdef XP_WIN
#  undef NEW_H
#  define NEW_H "new.h"
#endif
#include <nsStringAPI.h>

#include <common.h>

