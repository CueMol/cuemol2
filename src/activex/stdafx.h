//
// stdafx.h : Common include files
//

#pragma once

#ifndef STRICT
#define STRICT
#endif

//
//
// #ifndef WINVER
// #define WINVER 0x0400
// #endif

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0400
#endif						

// #ifndef _WIN32_WINDOWS
// #define _WIN32_WINDOWS 0x0410
// #endif

// #ifndef _WIN32_IE
// #define _WIN32_IE 0x0400
// #endif

#define _ATL_APARTMENT_THREADED
// #define _ATL_NO_AUTOMATIC_NAMESPACE
// #define _ATL_CSTRING_EXPLICIT_CONSTRUCTORS
// #define _ATL_ALL_WARNINGS

#include <atlbase.h>
#include <atlcom.h>
#include <atlctl.h>

//#include <atlwin.h>
#include <atltypes.h>
//#include <atlhost.h>

#include <gl/gl.h>
#include <gl/glu.h>

#include <common.h>

using namespace ATL;


