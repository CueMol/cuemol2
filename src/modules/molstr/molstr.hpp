// -*-Mode: C++;-*-
//
// molstr's library-related routines
//

#ifndef MOLSTR_DLL_H__
#define MOLSTR_DLL_H__

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef MOLSTR_EXPORTS
# define MOLSTR_API __declspec(dllexport)
#else
# define MOLSTR_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef MOLSTR_EXPORTS
#    define MOLSTR_API __attribute__ ((visibility ("default")))
#  else
#    define MOLSTR_API
#  endif

#else

// for non-MS platforms (without visattr)
#define MOLSTR_API

#endif // WIN32


#include <qlib/LScrSmartPtr.hpp>
#include "ResidIndex.hpp"

namespace molstr {

  /// Initialize the molstr library
  MOLSTR_API bool init();

  /// Cleanup the molstr library
  MOLSTR_API void fini();

  // typedefs for molstr objects
  class MolCoord;
  typedef qlib::LScrSp<MolCoord> MolCoordPtr;

  class MolChain;
  typedef qlib::LScrSp<MolChain> MolChainPtr;

  class MolResidue;
  typedef qlib::LScrSp<MolResidue> MolResiduePtr;

  class MolAtom;
  typedef qlib::LScrSp<MolAtom> MolAtomPtr;

  class Selection;
  typedef qlib::LScrSp<Selection> SelectionPtr;

  class SelCommand;
  typedef qlib::LScrSp<SelCommand> SelCommandPtr;

  class ColoringScheme;
  typedef qlib::LScrSp<ColoringScheme> ColoringSchemePtr;

  MC_DECL_SCRSP(MolRenderer);
}

#endif // MOLSTR_DLL_H__
