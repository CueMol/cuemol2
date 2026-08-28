// -*-Mode: C++;-*-
//
// GROMACS .gro coordinate file reader class
//

#include <common.h>

#include "GROFileReader.hpp"

#include <cmath>

#include <qlib/LineStream.hpp>
#include <qlib/LChar.hpp>
#include <qlib/Vector4D.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ElemSym.hpp>
#include <modules/molstr/ResidIndex.hpp>

#include <modules/symm/CrystalInfo.hpp>

using namespace mdtools;
using namespace molstr;

namespace {

// Conversion factor from GROMACS nm to CueMol Angstrom
constexpr double NM_TO_ANGSTROM = 10.0;

// GROMOS87 fixed prefix length: %5d resid + %-5s resname + %5s aname + %5d atomid
constexpr int GRO_PREFIX_LEN = 20;

// Standard position field width (%8.3f). High precision variants use wider fields.
constexpr int GRO_DEFAULT_POS_WIDTH = 8;

// Minimum length for a valid atom line: prefix + 3 standard position fields
constexpr int GRO_MIN_ATOM_LINE_LEN = GRO_PREFIX_LEN + 3 * GRO_DEFAULT_POS_WIDTH;

// The residue number is written as %5d, so it wraps around at 100000.
constexpr int GRO_RESID_MODULO = 100000;

// Upper bound on the per-file skipped-atom warnings written to the log.
constexpr int GRO_MAX_WARN = 10;

LString stripLineEnd(const LString &line)
{
  return line.trim("\r\n");
}

}  // namespace

GROFileReader::GROFileReader()
    : m_lineno(0), m_nDeclAtoms(0), m_nReadAtoms(0),
      m_nPosWidth(GRO_DEFAULT_POS_WIDTH), m_curChain("A"), m_nResidOffset(0),
      m_nPrevResid(0), m_bHasPrevResid(false), m_nSkipAtoms(0)
{
}

GROFileReader::~GROFileReader()
{
  MB_DPRINTLN("GROFileReader destructed (%p)", this);
}

/////////////

const char *GROFileReader::getName() const
{
  return "gro";
}

const char *GROFileReader::getTypeDescr() const
{
  return "GROMACS Coordinates (*.gro)";
}

const char *GROFileReader::getFileExt() const
{
  return "*.gro";
}

qsys::ObjectPtr GROFileReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/// Content sniff: line 2 must be a non-negative integer (declared atom
/// count) and line 3 must look like a GROMOS87 fixed-column atom line
/// (>= 44 chars with three parseable doubles at columns 20/28/36).
///
/// Every fall-through is CONTENT_UNKNOWN, never CONTENT_NO: the caller
/// may hand us a byte-capped stream whose last line is cut short, and
/// a length / numeric-parse / missing-line failure on a truncated line
/// says nothing about the format. NO is reserved for positively
/// recognising a competing format, which this sniffer never does.
int GROFileReader::canHandleContent(qlib::InStream &ins) const
{
  qlib::LineStream lin(ins);

  // Line 1: title -- free form, skip without validation.
  if (!lin.ready()) return CONTENT_UNKNOWN;
  lin.readLine();

  // Line 2: atom count.
  if (!lin.ready()) return CONTENT_UNKNOWN;
  LString count_line = stripLineEnd(lin.readLine()).trim();
  int natoms = -1;
  if (!count_line.toInt(&natoms)) return CONTENT_UNKNOWN;
  if (natoms < 0) return CONTENT_UNKNOWN;

  // An empty .gro (natoms == 0) is theoretically valid but
  // indistinguishable from arbitrary text, so report UNKNOWN.
  if (natoms == 0) return CONTENT_UNKNOWN;

  // Line 3: first atom line. Require the standard fixed layout to be
  // recognizable -- length must accommodate the 3 position fields.
  if (!lin.ready()) return CONTENT_UNKNOWN;
  LString atom_line = stripLineEnd(lin.readLine());
  if (static_cast<int>(atom_line.length()) < GRO_MIN_ATOM_LINE_LEN)
    return CONTENT_UNKNOWN;

  double xyz;
  if (!atom_line.substr(20, 8).trim().toDouble(&xyz)) return CONTENT_UNKNOWN;
  if (!atom_line.substr(28, 8).trim().toDouble(&xyz)) return CONTENT_UNKNOWN;
  if (!atom_line.substr(36, 8).trim().toDouble(&xyz)) return CONTENT_UNKNOWN;

  return CONTENT_YES;
}

/////////

bool GROFileReader::read(qlib::InStream &ins)
{
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  m_lineno = 0;
  m_nDeclAtoms = 0;
  m_nReadAtoms = 0;
  m_nPosWidth = GRO_DEFAULT_POS_WIDTH;
  m_title = LString();
  m_curChain = LString("A");
  m_nResidOffset = 0;
  m_nPrevResid = 0;
  m_bHasPrevResid = false;
  m_nSkipAtoms = 0;

  try {
    qlib::LineStream lin(ins);

    if (!readFrame(lin)) {
      MB_THROW(GROFileFormatException, "GRO file is empty");
      return false;
    }

    // Multi-frame .gro is a concatenated trajectory; the first version
    // supports single-frame only. Warn once and ignore the remainder so
    // a single representative snapshot is still loaded.
    if (lin.ready()) {
      LOG_DPRINTLN("GROFileReader> Warning: multi-frame .gro detected; "
                   "only the first frame is loaded "
                   "(use a trajectory reader for subsequent frames)");
    }

    m_pMol->applyTopology();
    m_pMol->calcProt2ndry();
  }
  catch (...) {
    m_pMol = MolCoordPtr();
    throw;
  }

  LOG_DPRINTLN("GROFileReader> read %d atoms", m_nReadAtoms);
  if (m_nSkipAtoms > 0) {
    LOG_DPRINTLN("GROFileReader> Warning: %d atom(s) skipped (duplicated in the "
                 "same residue); the atom count no longer matches the file, so "
                 "trajectory (xtc/trr/dcd) attachment will fail",
                 m_nSkipAtoms);
  }

  m_pMol = MolCoordPtr();
  return true;
}

bool GROFileReader::readFrame(qlib::LineStream &lin)
{
  // Line 1: title (free form, may contain a "t=" timestamp).
  if (!lin.ready()) return false;
  ++m_lineno;
  m_title = stripLineEnd(lin.readLine());

  // Line 2: declared atom count.
  if (!lin.ready()) {
    MB_THROW(GROFileFormatException, "Missing atom count line");
    return false;
  }
  ++m_lineno;
  LString count_line = stripLineEnd(lin.readLine()).trim();
  if (!count_line.toInt(&m_nDeclAtoms)) {
    MB_THROW(GROFileFormatException,
             LString::format("Invalid atom count at line %d: '%s'",
                             m_lineno, count_line.c_str()));
    return false;
  }
  if (m_nDeclAtoms < 0) {
    MB_THROW(GROFileFormatException,
             LString::format("Negative atom count at line %d: %d",
                             m_lineno, m_nDeclAtoms));
    return false;
  }

  // Atom lines. The residue unwrapping state is per frame.
  m_nResidOffset = 0;
  m_nPrevResid = 0;
  m_bHasPrevResid = false;

  for (int i = 0; i < m_nDeclAtoms; ++i) {
    if (!lin.ready()) {
      MB_THROW(GROFileFormatException,
               LString::format("Unexpected EOF: declared %d atoms but only %d present",
                               m_nDeclAtoms, i));
      return false;
    }
    ++m_lineno;
    LString line = stripLineEnd(lin.readLine());
    if (i == 0) {
      determineFieldLayout(line);
    }
    if (parseAtomLine(line)) ++m_nReadAtoms;
  }

  // Box vector line.
  if (!lin.ready()) {
    LOG_DPRINTLN("GROFileReader> Warning: missing box vector line at line %d",
                 m_lineno + 1);
    return true;
  }
  ++m_lineno;
  LString box_line = stripLineEnd(lin.readLine());
  parseBoxLine(box_line);

  return true;
}

void GROFileReader::determineFieldLayout(const LString &line)
{
  const int len = static_cast<int>(line.length());
  if (len < GRO_PREFIX_LEN + 3 * GRO_DEFAULT_POS_WIDTH) {
    MB_THROW(GROFileFormatException,
             LString::format("Atom line too short at line %d (length=%d): '%s'",
                             m_lineno, len, line.c_str()));
    return;
  }

  // The prefix (resid/resname/aname/atomid, 20 chars) is fixed. The
  // remainder is either 3*W (positions only) or 6*W (positions +
  // velocities) where W is the position field width.
  const int rest = len - GRO_PREFIX_LEN;

  int W = GRO_DEFAULT_POS_WIDTH;
  if (rest == 3 * GRO_DEFAULT_POS_WIDTH || rest == 6 * GRO_DEFAULT_POS_WIDTH) {
    // Standard %8.3f layout (with or without velocities).
    W = GRO_DEFAULT_POS_WIDTH;
  }
  else if (rest % 6 == 0 && (rest / 6) >= GRO_DEFAULT_POS_WIDTH) {
    // High precision with velocities (e.g. %12.7f -> rest = 72).
    W = rest / 6;
  }
  else if (rest % 3 == 0 && (rest / 3) >= GRO_DEFAULT_POS_WIDTH) {
    // High precision without velocities.
    W = rest / 3;
  }
  else {
    // Fallback: locate the first decimal point in the position field
    // and infer width from the dot position assuming a 5-digit integer.
    int dot = -1;
    for (int k = GRO_PREFIX_LEN; k < len; ++k) {
      if (line.getAt(k) == '.') { dot = k; break; }
    }
    if (dot > GRO_PREFIX_LEN + 4) {
      // Width = integer chars (dot - 20 + 1) + decimal digits.
      int int_chars = dot - GRO_PREFIX_LEN;  // includes sign + digits before '.'
      // Find decimal count by scanning until non-digit.
      int k = dot + 1;
      while (k < len && line.getAt(k) >= '0' && line.getAt(k) <= '9') ++k;
      int dec_chars = k - dot - 1;
      W = int_chars + 1 + dec_chars;  // +1 for the '.' itself
    }
    if (W < GRO_DEFAULT_POS_WIDTH) W = GRO_DEFAULT_POS_WIDTH;
  }

  m_nPosWidth = W;
}

bool GROFileReader::parseAtomLine(const LString &line)
{
  const int len = static_cast<int>(line.length());
  const int required = GRO_PREFIX_LEN + 3 * m_nPosWidth;
  if (len < required) {
    MB_THROW(GROFileFormatException,
             LString::format("Atom line too short at line %d (length=%d, "
                             "expected>=%d): '%s'",
                             m_lineno, len, required, line.c_str()));
    return false;
  }

  // Fixed prefix: resid(0..5), resname(5..10), aname(10..15), atomid(15..20).
  LString resid_str = line.substr(0, 5).trim();
  LString resname = line.substr(5, 5).trim();
  LString aname = line.substr(10, 5).trim();
  // atomid (15..20) is informational and ignored; CueMol assigns its own IDs.

  int resid = 0;
  if (!resid_str.toInt(&resid)) {
    MB_THROW(GROFileFormatException,
             LString::format("Invalid residue number at line %d: '%s'",
                             m_lineno, resid_str.c_str()));
    return false;
  }

  // The %5d residue field wraps around at 100000, so a decreasing residue
  // number means the numbering restarted. Add a 100000 offset to keep the
  // residue index unique and monotonic: for a genuine wraparound this
  // restores the sequential numbering GROMACS intended, and for any other
  // restart the original number is still recoverable as (index % 100000).
  if (m_bHasPrevResid && resid < m_nPrevResid) {
    m_nResidOffset += GRO_RESID_MODULO;
    if (m_nPrevResid == GRO_RESID_MODULO - 1 && resid == 0) {
      LOG_DPRINTLN("GROFileReader> residue number wraparound at line %d; "
                   "renumbering the following residues from %d",
                   m_lineno, m_nResidOffset);
    }
    else {
      LOG_DPRINTLN("GROFileReader> Warning: residue number decreased at line "
                   "%d (%d -> %d); renumbering the following residues with a "
                   "%d offset",
                   m_lineno, m_nPrevResid, resid, m_nResidOffset);
    }
  }
  m_nPrevResid = resid;
  m_bHasPrevResid = true;
  const int ext_resid = resid + m_nResidOffset;

  if (resname.isEmpty()) resname = "UNK";
  if (aname.isEmpty()) {
    MB_THROW(GROFileFormatException,
             LString::format("Missing atom name at line %d", m_lineno));
    return false;
  }

  // Positions (nm in source, converted to Angstrom).
  const int W = m_nPosWidth;
  double x, y, z;
  if (!line.substr(GRO_PREFIX_LEN + 0 * W, W).trim().toDouble(&x)) {
    MB_THROW(GROFileFormatException,
             LString::format("Invalid X coordinate at line %d", m_lineno));
    return false;
  }
  if (!line.substr(GRO_PREFIX_LEN + 1 * W, W).trim().toDouble(&y)) {
    MB_THROW(GROFileFormatException,
             LString::format("Invalid Y coordinate at line %d", m_lineno));
    return false;
  }
  if (!line.substr(GRO_PREFIX_LEN + 2 * W, W).trim().toDouble(&z)) {
    MB_THROW(GROFileFormatException,
             LString::format("Invalid Z coordinate at line %d", m_lineno));
    return false;
  }
  // Velocities (columns 20+3W .. 20+6W) are intentionally skipped:
  // MolAtom does not carry a velocity slot and the visualization use
  // case does not consume them.

  qlib::Vector4D pos(x * NM_TO_ANGSTROM, y * NM_TO_ANGSTROM, z * NM_TO_ANGSTROM);

  MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
  pAtom->setParentUID(m_pMol->getUID());
  pAtom->setName(aname);
  pAtom->setElement(guessElement(aname));
  pAtom->setChainName(m_curChain);
  pAtom->setResIndex(ResidIndex(ext_resid));
  pAtom->setResName(resname);
  pAtom->setPos(pos);

  int aid = m_pMol->appendAtom(pAtom);
  if (aid < 0) {
    // Duplicated atom (same chain/residue/name): skip it and keep reading,
    // so that a partially malformed file still loads.
    ++m_nSkipAtoms;
    if (m_nSkipAtoms <= GRO_MAX_WARN) {
      LOG_DPRINTLN("GROFileReader> Warning: skipped duplicated atom at line "
                   "%d: %s/%d/%s",
                   m_lineno, m_curChain.c_str(), ext_resid, aname.c_str());
    }
    return false;
  }

  return true;
}

void GROFileReader::parseBoxLine(const LString &line)
{
  // Whitespace-split into floating-point tokens.
  LString trimmed = line.trim();
  if (trimmed.isEmpty()) {
    LOG_DPRINTLN("GROFileReader> Warning: empty box vector line; "
                 "unit cell information not set");
    return;
  }

  std::list<LString> tokens;
  trimmed.split(' ', tokens);
  std::vector<double> vals;
  vals.reserve(tokens.size());
  for (std::list<LString>::const_iterator it = tokens.begin(); it != tokens.end(); ++it) {
    LString tok = it->trim();
    if (tok.isEmpty()) continue;
    double v;
    if (!tok.toDouble(&v)) {
      LOG_DPRINTLN("GROFileReader> Warning: invalid box token '%s' at line %d; "
                   "unit cell information not set",
                   tok.c_str(), m_lineno);
      return;
    }
    vals.push_back(v);
  }

  double a = 0.0, b = 0.0, c = 0.0;
  double alpha = 90.0, beta = 90.0, gamma = 90.0;

  if (vals.size() == 3) {
    // Rectangular (orthogonal) box.
    a = vals[0] * NM_TO_ANGSTROM;
    b = vals[1] * NM_TO_ANGSTROM;
    c = vals[2] * NM_TO_ANGSTROM;
  }
  else if (vals.size() == 9) {
    // Triclinic box in GROMACS order:
    //   v1(x)  v2(y)  v3(z)  v1(y)  v1(z)  v2(x)  v2(z)  v3(x)  v3(y)
    // Reconstruct the three cell vectors (in nm) and compute the cell
    // lengths/angles, then convert lengths to Angstrom.
    const double v1x = vals[0], v2y = vals[1], v3z = vals[2];
    const double v1y = vals[3], v1z = vals[4];
    const double v2x = vals[5], v2z = vals[6];
    const double v3x = vals[7], v3y = vals[8];

    const double la = std::sqrt(v1x*v1x + v1y*v1y + v1z*v1z);
    const double lb = std::sqrt(v2x*v2x + v2y*v2y + v2z*v2z);
    const double lc = std::sqrt(v3x*v3x + v3y*v3y + v3z*v3z);

    if (la <= 0.0 || lb <= 0.0 || lc <= 0.0) {
      LOG_DPRINTLN("GROFileReader> Warning: degenerate cell vectors; "
                   "unit cell information not set");
      return;
    }

    const double rad2deg = 180.0 / M_PI;
    const double cos_alpha = (v2x*v3x + v2y*v3y + v2z*v3z) / (lb * lc);
    const double cos_beta  = (v1x*v3x + v1y*v3y + v1z*v3z) / (la * lc);
    const double cos_gamma = (v1x*v2x + v1y*v2y + v1z*v2z) / (la * lb);

    a = la * NM_TO_ANGSTROM;
    b = lb * NM_TO_ANGSTROM;
    c = lc * NM_TO_ANGSTROM;
    alpha = std::acos(std::max(-1.0, std::min(1.0, cos_alpha))) * rad2deg;
    beta  = std::acos(std::max(-1.0, std::min(1.0, cos_beta)))  * rad2deg;
    gamma = std::acos(std::max(-1.0, std::min(1.0, cos_gamma))) * rad2deg;
  }
  else {
    LOG_DPRINTLN("GROFileReader> Warning: box vector line has %d values "
                 "(expected 3 or 9); unit cell information not set",
                 static_cast<int>(vals.size()));
    return;
  }

  symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");
  if (pci.isnull()) {
    LOG_DPRINTLN("GROFileReader> Warning: failed to attach CrystalInfo");
    return;
  }
  pci->setCellDimension(a, b, c, alpha, beta, gamma);
}

int GROFileReader::guessElement(const LString &aname) const
{
  // Try whole name first (handles cases like "Na", "Mg", "Fe").
  int id = ElemSym::str2SymID(aname);
  if (id != ElemSym::XX) return id;

  // Skip leading digits (GROMACS sometimes uses names like "1HA").
  const int len = static_cast<int>(aname.length());
  int start = 0;
  while (start < len && aname.getAt(start) >= '0' && aname.getAt(start) <= '9')
    ++start;
  if (start >= len) return ElemSym::XX;

  // Try the first two characters with second char lowercased
  // (canonical element symbol form).
  if (start + 1 < len) {
    char c0 = aname.getAt(start);
    char c1 = aname.getAt(start + 1);
    if (c1 >= 'A' && c1 <= 'Z') c1 = static_cast<char>(c1 - 'A' + 'a');
    if (c0 >= 'a' && c0 <= 'z') c0 = static_cast<char>(c0 - 'a' + 'A');
    char buf2[3] = { c0, c1, '\0' };
    id = ElemSym::str2SymID(LString(buf2));
    if (id != ElemSym::XX) return id;
  }

  // Fall back to the first character alone.
  char c0 = aname.getAt(start);
  if (c0 >= 'a' && c0 <= 'z') c0 = static_cast<char>(c0 - 'a' + 'A');
  char buf1[2] = { c0, '\0' };
  id = ElemSym::str2SymID(LString(buf1));
  return id;  // XX if still unknown
}
