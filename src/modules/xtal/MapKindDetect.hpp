// -*-Mode: C++;-*-
//
// Crystallographic vs cryo-EM map kind detection from CCP4/MRC header
// evidence (pure function, no I/O).
//

#ifndef XTAL_MAP_KIND_DETECT_HPP_INCLUDED
#define XTAL_MAP_KIND_DETECT_HPP_INCLUDED

#include "xtal.hpp"

#include <vector>
#include <qlib/LString.hpp>

namespace xtal {

  /// Header fields relevant to the map kind decision, in file (crs) order
  /// as read from a CCP4/MRC header.
  struct XTAL_API MrcHeaderInfo {
    int nc, nr, ns;                ///< NC/NR/NS: block size
    int ncstart, nrstart, nsstart; ///< NCSTART/NRSTART/NSSTART
    int nx, ny, nz;                ///< NX/NY/NZ: grid intervals of the cell
    double alpha, beta, gamma;     ///< cell angles (degrees)
    int ispg;                      ///< ISPG: space group number
    int nversion;                  ///< NVERSION (MRC2014; 0 if absent)
    qlib::LString exttyp;          ///< EXTTYP (MRC2014; empty if absent)
    bool hasOrigin;                ///< ORIGIN fields are valid and non-zero
    double origin[3];              ///< ORIGIN (angstrom)
    std::vector<qlib::LString> labels; ///< header labels

    MrcHeaderInfo();
  };

  /// Map kind values (same numbering as DensityMap::MAPTYPE_*)
  enum {
    MAPKIND_XTAL = 1,
    MAPKIND_EM = 2,
  };

  /// True when the MRC2014 ORIGIN triple is usable as the map origin:
  /// all components finite and sane, and at least one non-zero.
  XTAL_API bool mrcOriginIsValid(const float o[3]);

  /// Decide the map kind from header evidence. Conservative: the answer is
  /// MAPKIND_XTAL unless the header carries a strong EM signature (ISPG 0 or
  /// a volume stack, a non-zero ORIGIN, an EM software label) or the
  /// moderate MRC2014-volume signature (ISPG 1, NVERSION >= 20140,
  /// orthogonal cell, block == whole cell, zero starts).
  XTAL_API int detectMapKind(const MrcHeaderInfo &h);

}

#endif
