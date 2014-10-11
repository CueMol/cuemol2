// -*-Mode: C++;-*-
//
// Molecular visualization module
//  module loader/common definitions
//

#ifndef MOLVIS_HPP_INCLUDED
#define MOLVIS_HPP_INCLUDED

#include <qlib/LString.hpp>

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef MOLVIS_EXPORTS
# define MOLVIS_API __declspec(dllexport)
#else
# define MOLVIS_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef MOLVIS_EXPORTS
#    define MOLVIS_API __attribute__ ((visibility ("default")))
#  else
#    define MOLVIS_API
#  endif

#else

// for non-MS platforms (without visattr)
#define MOLVIS_API

#endif // WIN32

namespace molvis {

/// Common Initialization for the molvis library
MOLVIS_API bool init();

/// Common Finalization for the molvis library
MOLVIS_API void fini();

}

#endif

