// -*-Mode: C++;-*-
//
// Crystallographic vs cryo-EM map kind detection from CCP4/MRC header
// evidence.
//

#include <common.h>

#include "MapKindDetect.hpp"

#include <cmath>

using namespace xtal;
using qlib::LString;

MrcHeaderInfo::MrcHeaderInfo()
{
  nc = nr = ns = 0;
  ncstart = nrstart = nsstart = 0;
  nx = ny = nz = 0;
  alpha = beta = gamma = 90.0;
  ispg = 0;
  nversion = 0;
  hasOrigin = false;
  origin[0] = origin[1] = origin[2] = 0.0;
}

bool xtal::mrcOriginIsValid(const float o[3])
{
  // A sanity bound well above any realistic map placement (angstrom);
  // uninitialized header words decode to huge or non-finite floats.
  const double dmax = 1.0e6;
  bool bNonZero = false;
  for (int i = 0; i < 3; ++i) {
    if (!std::isfinite(o[i]))
      return false;
    if (std::fabs(double(o[i])) > dmax)
      return false;
    if (o[i] != 0.0f)
      bNonZero = true;
  }
  return bNonZero;
}

namespace {

  bool labelsHaveEMSignature(const std::vector<LString> &labels)
  {
    // Substrings written into MRC labels by common EM software / EMDB.
    static const char *sigs[] = {
      "emdatabank", "emdb", "relion", "cryosparc", "eman", "imod",
      "motioncor", NULL
    };
    for (size_t i = 0; i < labels.size(); ++i) {
      const LString l = labels[i].toLowerCase();
      for (int j = 0; sigs[j] != NULL; ++j) {
        if (l.indexOf(sigs[j]) >= 0)
          return true;
      }
    }
    return false;
  }

  bool isNear(double a, double b)
  {
    return std::fabs(a - b) < 1.0e-3;
  }

}

int xtal::detectMapKind(const MrcHeaderInfo &h)
{
  // Strong evidence: crystallographic maps always carry ISPG >= 1, while
  // EM image/volume conventions use ISPG 0 (image) or >= 401 (volume
  // stack).
  if (h.ispg == 0)
    return MAPKIND_EM;
  if (h.ispg >= 401)
    return MAPKIND_EM;

  // Strong evidence: a non-zero MRC2014 ORIGIN places the map in absolute
  // coordinates, which only EM pipelines do.
  if (h.hasOrigin)
    return MAPKIND_EM;

  // Strong evidence: EM software / EMDB labels.
  if (labelsHaveEMSignature(h.labels))
    return MAPKIND_EM;

  // Moderate evidence: an MRC2014 P1 volume with an orthogonal cell whose
  // block is exactly the whole cell starting at 0. P1 crystal maps from
  // CCP4 fft also cover the whole cell, but triclinic cells are almost
  // never orthogonal and pre-2014 writers leave NVERSION 0.
  if (h.ispg == 1 && h.nversion >= 20140 &&
      isNear(h.alpha, 90.0) && isNear(h.beta, 90.0) && isNear(h.gamma, 90.0) &&
      h.nc == h.nx && h.nr == h.ny && h.ns == h.nz &&
      h.ncstart == 0 && h.nrstart == 0 && h.nsstart == 0)
    return MAPKIND_EM;

  return MAPKIND_XTAL;
}
