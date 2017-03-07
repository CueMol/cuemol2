/*
  Win32 config file
*/

#ifndef __WIN32CONFIG_H_INCLUDED__
#define __WIN32CONFIG_H_INCLUDED__

// We only support wintel 32bit OS Windows version.
#define _CRT_SECURE_NO_WARNINGS 1
#define BYTEORDER 1234
#define HOST_FLOAT_FORMAT IEEE_LE
#define SIZEOF_CHAR 1
#define SIZEOF_SHORT 2
#define SIZEOF_INT 4
#define SIZEOF_LONG 4
#define SIZEOF_LONG_LONG 8
#define SIZEOF_FLOAT 4
#define SIZEOF_DOUBLE 8
#define STR_GUI_ARCH "WIN"

#ifdef _WIN64
#  define SIZEOF_VOIDP 8
#  pragma warning(disable:4267)
#else
#  define SIZEOF_VOIDP 4
#endif

#define HAVE_STDARG_H
#define MB_PATH_SEPARATOR '\\'
#define fopen_pathconv fopen
#pragma warning(disable:4786)
#pragma warning(disable:4251)
// windows is assumed to always have 16-bit wchar_t
#define HAVE_WCHAR_T_16BIT 1
// #define USE_HASH_MAP
// #define USE_MULTITHREAD
// #define USE_BERKELEY_DB
#define HAVE_BOOST_THREAD 1
#define HAVE_GL_GL_H 1
#define HAVE_GL_GLU_H 1
#ifdef _DEBUG
#define MB_DEBUG
#endif

#define HAVE_FFTW3_H
#define HAVE_DECL_FFTWF_EXECUTE

#pragma warning(disable:4290)
#pragma warning(disable:4661)
#define DLLEXPORT __declspec(dllexport)

// #include <windows.h>
#include <direct.h>

#define HAVE_PNG_H 1

#define GECKO_SDK_MAJOR_VER 6

#define HAVE_GL_GLEW_H 1
#define HAVE_GLEW 1
#define USE_OPENGL 1
#define HAVE_MDTOOLS_MODULE 1

#define HAVE_JAVASCRIPT
//#define NO_SCRIPT

#define __STDC_LIMIT_MACROS
#define __STDC_CONSTANT_MACROS

#define HAVE_LCMS2_H 1
#define HAVE_LZMA_H 1

#define USE_BOOST_TIMER 1

#endif
