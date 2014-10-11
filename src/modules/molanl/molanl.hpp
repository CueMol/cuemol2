// -*-Mode: C++;-*-
//
// Biomolecule analysis module
//  module loader/common impl
//

#ifndef MOLANL_HPP_INCLUDED
#define MOLANL_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef MOLANL_EXPORTS
# define MOLANL_API __declspec(dllexport)
#else
# define MOLANL_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef MOLANL_EXPORTS
#    define MOLANL_API __attribute__ ((visibility ("default")))
#  else
#    define MOLANL_API
#  endif

#else

// for non-MS platforms (without visattr)
#define MOLANL_API

#endif // WIN32


namespace molanl {

/// Common Initialization for the molanl library
MOLANL_API bool init();

/// Common Finalization for the molanl library
MOLANL_API void fini();

}

#endif

