// -*-Mode: C++;-*-
//
// qsys's library-related routines
//
// $Id: qsys.hpp,v 1.13 2010/12/03 09:50:35 rishitani Exp $

#ifndef QSYS_DLL_H__
#define QSYS_DLL_H__

#ifdef WIN32

// for MS-Windows
#ifdef QSYS_EXPORTS
# define QSYS_API __declspec(dllexport)
#else
# define QSYS_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef QSYS_EXPORTS
#    define QSYS_API __attribute__ ((visibility ("default")))
#  else
#    define QSYS_API
#  endif

#else

// for non-MS platforms (without visattr)
#define QSYS_API

#endif // WIN32

#include <qlib/LScrSmartPtr.hpp>

namespace qsys {

  /// Initialize the qsys library
  QSYS_API bool init(const char *config);

  /// Cleanup the qsys library
  QSYS_API void fini();

  MC_DECL_SCRSP(Scene);
  MC_DECL_SCRSP(Object);
  MC_DECL_SCRSP(Renderer);
  MC_DECL_SCRSP(View);
  MC_DECL_SCRSP(Camera);
  MC_DECL_SCRSP(InOutHandler);

  MC_DECL_SCRSP(ObjReader);
  MC_DECL_SCRSP(SceneXMLReader);
  MC_DECL_SCRSP(SceneXMLWriter);
  MC_DECL_SCRSP(ObjExtData);
  MC_DECL_SCRSP(DrawObj);
  MC_DECL_SCRSP(AnimMgr);

  MC_DECL_SCRSP(MultiGradient);
}

#endif // QSYS_DLL_H__

