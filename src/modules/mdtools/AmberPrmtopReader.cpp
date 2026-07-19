// -*-Mode: C++;-*-
//
// AMBER prmtop (parm7) topology reader class
//

#include <common.h>

#include "AmberPrmtopReader.hpp"
#include "AmberCrdReader.hpp"

#include <cmath>
#include <cstring>
#include <memory>

#include <qlib/LineStream.hpp>
#include <qlib/Vector4D.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIndex.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/ElemSym.hpp>

using namespace mdtools;
using namespace molstr;

namespace {

// Default chain name assigned to all atoms (prmtop has no chain concept).
const char *DEFAULT_CHAIN = "A";

// Sniff buffer size for canHandleContent.
constexpr int SNIFF_BUF_SIZE = 256;

LString trimStr(const LString &s)
{
  return s.trim(" \t\r\n");
}

}  // namespace

AmberPrmtopReader::AmberPrmtopReader()
    : m_natom(0), m_nres(0), m_nbonh(0), m_mbona(0), m_ifbox(0),
      m_nBondMode(BONDMODE_FILE)
{
}

AmberPrmtopReader::~AmberPrmtopReader()
{
  MB_DPRINTLN("AmberPrmtopReader destructed (%p)", this);
}

/////////////

const char *AmberPrmtopReader::getName() const
{
  return "amberprm";
}

const char *AmberPrmtopReader::getTypeDescr() const
{
  return "AMBER topology (*.prmtop;*.parm7;*.top)";
}

const char *AmberPrmtopReader::getFileExt() const
{
  return "*.prmtop;*.parm7;*.top";
}

qsys::ObjectPtr AmberPrmtopReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/// Content sniff: AMBER 7+ prmtop begins with "%VERSION" (the format
/// header) followed by "%FLAG" sections. Pre-Amber 7 (label-less) files
/// are out of scope and report UNKNOWN to let other readers try.
int AmberPrmtopReader::canHandleContent(qlib::InStream &ins) const
{
  char buf[SNIFF_BUF_SIZE];
  int total = 0;
  while (total < SNIFF_BUF_SIZE) {
    int n = ins.read(buf, total, SNIFF_BUF_SIZE - total);
    if (n <= 0) break;
    total += n;
  }
  if (total <= 0) return CONTENT_UNKNOWN;

  // Reject obvious binary (NUL bytes in the head).
  for (int i = 0; i < total; ++i) {
    if (buf[i] == '\0') return CONTENT_NO;
  }

  LString head(buf, total);
  if (head.indexOf("%VERSION") >= 0) return CONTENT_YES;
  if (head.indexOf("%FLAG") >= 0) return CONTENT_YES;

  return CONTENT_UNKNOWN;
}

/////////

bool AmberPrmtopReader::read(qlib::InStream &ins)
{
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  try {
    parseTopology(ins);
    buildMol();
    const bool bHasCoord = loadCoord();

    m_pMol->applyTopology();
    // Secondary structure is geometry-based; only compute it when we have real
    // coordinates. For a topology-only load (e.g. prmtop used as a trajectory
    // topology) the Trajectory recomputes it on frame 0.
    if (bHasCoord)
      m_pMol->calcProt2ndry();
  }
  catch (...) {
    m_pMol = MolCoordPtr();
    throw;
  }

  LOG_DPRINTLN("AmberPrmtopReader> read %d atoms, %d residues, %d bonds",
               m_natom, m_nres, static_cast<int>(m_bonds.size()));

  m_pMol = MolCoordPtr();
  return true;
}

void AmberPrmtopReader::parseTopology(qlib::InStream &ins)
{
  qlib::LineStream lin(ins);

  // First non-empty line must be %VERSION (Amber 7+ new format).
  // If we hit a %FLAG without seeing %VERSION, accept too (some toolkits omit it).
  bool sawVersion = false;
  LString firstLine;
  while (lin.ready()) {
    firstLine = trimStr(lin.readLine());
    if (!firstLine.isEmpty()) break;
  }
  if (firstLine.isEmpty()) {
    MB_THROW(qlib::FileFormatException, "Empty prmtop file");
    return;
  }
  if (firstLine.startsWith("%VERSION")) {
    sawVersion = true;
  } else if (!firstLine.startsWith("%FLAG")) {
    // Pre-Amber 7 label-less format -- reject explicitly.
    MB_THROW(qlib::FileFormatException,
             "Pre-Amber-7 (label-less) prmtop format is not supported");
    return;
  }

  // Walk %FLAG / %FORMAT pairs. If we already consumed a %FLAG line above,
  // prime curFlag with it.
  LString curFlag;
  LString curFmt;
  if (firstLine.startsWith("%FLAG")) {
    curFlag = trimStr(firstLine.substr(5));
  }

  auto isComment = [](const LString &l) {
    return l.startsWith("%COMMENT");
  };

  while (lin.ready()) {
    // Find next FLAG line.
    if (curFlag.isEmpty()) {
      LString line;
      while (lin.ready()) {
        line = trimStr(lin.readLine());
        if (line.isEmpty()) continue;
        if (isComment(line)) continue;
        if (line.startsWith("%VERSION")) continue;
        if (line.startsWith("%FLAG")) {
          curFlag = trimStr(line.substr(5));
          break;
        }
        // Stray non-tag line outside of any FLAG section -- ignore.
      }
      if (curFlag.isEmpty()) break;  // EOF
    }

    // Read %FORMAT line.
    curFmt = LString();
    while (lin.ready()) {
      LString line = trimStr(lin.readLine());
      if (line.isEmpty()) continue;
      if (isComment(line)) continue;
      if (line.startsWith("%FORMAT")) {
        int lp = line.indexOf('(');
        int rp = line.lastIndexOf(')');
        if (lp < 0 || rp < 0 || rp <= lp) {
          MB_THROW(qlib::FileFormatException,
                   LString::format("Malformed %%FORMAT in section %s: %s",
                                   curFlag.c_str(), line.c_str()));
          return;
        }
        curFmt = line.substr(lp + 1, rp - lp - 1);
        break;
      }
      MB_THROW(qlib::FileFormatException,
               LString::format("Expected %%FORMAT after %%FLAG %s, got: %s",
                               curFlag.c_str(), line.c_str()));
      return;
    }

    readFlagSection(lin, curFlag, curFmt);
    curFlag = LString();
  }

  if (!sawVersion && m_natom == 0) {
    // No %VERSION and no POINTERS parsed -- this is not a valid prmtop.
    MB_THROW(qlib::FileFormatException,
             "prmtop has no %VERSION header and no POINTERS section");
    return;
  }
  if (m_natom <= 0) {
    MB_THROW(qlib::FileFormatException, "prmtop POINTERS section missing or empty");
    return;
  }
}

AmberPrmtopReader::FortFmt AmberPrmtopReader::parseFortFmt(const LString &spec)
{
  // spec is the content inside the parentheses, e.g. "5E16.8", "20a4", "10I8".
  // Grammar (subset sufficient for prmtop):
  //   <nrec> <type> <width> [ . <decimals> ]
  // where type is one of a/A/I/E/F (case-insensitive).
  FortFmt fmt;
  const char *p = spec.c_str();
  const char *end = p + spec.length();

  // Skip leading whitespace
  while (p < end && (*p == ' ' || *p == '\t')) ++p;

  // Number of records per line
  int nrec = 0;
  while (p < end && *p >= '0' && *p <= '9') {
    nrec = nrec * 10 + (*p - '0');
    ++p;
  }
  if (nrec <= 0) {
    MB_THROW(qlib::FileFormatException,
             LString::format("Invalid FORMAT: '%s'", spec.c_str()));
    return fmt;
  }

  // Type letter
  if (p >= end) {
    MB_THROW(qlib::FileFormatException,
             LString::format("Truncated FORMAT: '%s'", spec.c_str()));
    return fmt;
  }
  char type = *p++;
  // Normalize to upper for I/E/F, keep lower 'a' as 'a'.
  if (type == 'A') type = 'a';
  if (type != 'a' && type != 'I' && type != 'E' && type != 'F') {
    MB_THROW(qlib::FileFormatException,
             LString::format("Unsupported FORMAT type '%c' in '%s'", type, spec.c_str()));
    return fmt;
  }

  // Width
  int width = 0;
  while (p < end && *p >= '0' && *p <= '9') {
    width = width * 10 + (*p - '0');
    ++p;
  }
  if (width <= 0) {
    MB_THROW(qlib::FileFormatException,
             LString::format("Invalid width in FORMAT: '%s'", spec.c_str()));
    return fmt;
  }

  // Decimals (optional, after '.') are ignored for parsing.
  fmt.nrec = nrec;
  fmt.width = width;
  fmt.type = type;
  return fmt;
}

void AmberPrmtopReader::skipRecords(qlib::LineStream &lin, int nrec, int count)
{
  if (count <= 0) return;
  int lines = (count + nrec - 1) / nrec;
  for (int i = 0; i < lines; ++i) {
    if (!lin.ready()) break;
    lin.readLine();
  }
}

void AmberPrmtopReader::readInts(qlib::LineStream &lin, const FortFmt &fmt,
                                 std::vector<int> &out, int count)
{
  out.clear();
  out.reserve(count);
  LString line;
  int onLine = 0;
  int linePos = 0;
  for (int i = 0; i < count; ++i) {
    if (onLine == 0) {
      if (!lin.ready()) {
        MB_THROW(qlib::FileFormatException,
                 LString::format("Unexpected EOF while reading int records (%d/%d)",
                                 i, count));
        return;
      }
      line = lin.readLine();
      linePos = 0;
    }
    LString field = line.substr(linePos, fmt.width);
    linePos += fmt.width;
    int v = 0;
    LString tok = trimStr(field);
    if (tok.isEmpty()) {
      MB_THROW(qlib::FileFormatException,
               LString::format("Empty int field at record %d", i));
      return;
    }
    if (!tok.toInt(&v)) {
      MB_THROW(qlib::FileFormatException,
               LString::format("Invalid int '%s' at record %d", tok.c_str(), i));
      return;
    }
    out.push_back(v);
    onLine = (onLine + 1) % fmt.nrec;
  }
}

void AmberPrmtopReader::readReals(qlib::LineStream &lin, const FortFmt &fmt,
                                  std::vector<double> &out, int count)
{
  out.clear();
  out.reserve(count);
  LString line;
  int onLine = 0;
  int linePos = 0;
  for (int i = 0; i < count; ++i) {
    if (onLine == 0) {
      if (!lin.ready()) {
        MB_THROW(qlib::FileFormatException,
                 LString::format("Unexpected EOF while reading real records (%d/%d)",
                                 i, count));
        return;
      }
      line = lin.readLine();
      linePos = 0;
    }
    LString field = line.substr(linePos, fmt.width);
    linePos += fmt.width;
    double v = 0.0;
    LString tok = trimStr(field);
    if (tok.isEmpty()) {
      MB_THROW(qlib::FileFormatException,
               LString::format("Empty real field at record %d", i));
      return;
    }
    if (!tok.toDouble(&v)) {
      MB_THROW(qlib::FileFormatException,
               LString::format("Invalid real '%s' at record %d", tok.c_str(), i));
      return;
    }
    out.push_back(v);
    onLine = (onLine + 1) % fmt.nrec;
  }
}

void AmberPrmtopReader::readStrings(qlib::LineStream &lin, const FortFmt &fmt,
                                    std::vector<LString> &out, int count)
{
  out.clear();
  out.reserve(count);
  LString line;
  int onLine = 0;
  int linePos = 0;
  for (int i = 0; i < count; ++i) {
    if (onLine == 0) {
      if (!lin.ready()) {
        MB_THROW(qlib::FileFormatException,
                 LString::format("Unexpected EOF while reading string records (%d/%d)",
                                 i, count));
        return;
      }
      line = lin.readLine();
      linePos = 0;
    }
    LString field = line.substr(linePos, fmt.width);
    linePos += fmt.width;
    out.push_back(trimStr(field));
    onLine = (onLine + 1) % fmt.nrec;
  }
}

void AmberPrmtopReader::readFlagSection(qlib::LineStream &lin,
                                       const LString &flag,
                                       const LString &fmt_spec)
{
  FortFmt fmt = parseFortFmt(fmt_spec);

  // POINTERS: 31 (or 32) integer counters. We only need a few.
  if (flag == "POINTERS") {
    std::vector<int> pointers;
    // Read at least 31 entries; the official count is 30-32 depending on Amber version.
    // We read until the next %FLAG, so read greedily by FORTRAN line shape.
    // Conservative: read 32 entries (one line of 10 + one line of 10 + one line of 10 + 2 = 4 lines for 10I8).
    constexpr int N_POINTERS = 31;
    readInts(lin, fmt, pointers, N_POINTERS);
    if (pointers.size() < 12) {
      MB_THROW(qlib::FileFormatException,
               "POINTERS section too short");
      return;
    }
    // Index meanings (0-based):
    //   0: NATOM, 1: NTYPES, 2: NBONH, 3: MBONA, 4: NTHETH, 5: MTHETA,
    //   6: NPHIH, 7: MPHIA, 8: NHPARM, 9: NPARM, 10: NNB, 11: NRES, ...
    //   27: IFBOX, ...
    m_natom = pointers[0];
    m_nbonh = pointers[2];
    m_mbona = pointers[3];
    m_nres  = pointers[11];
    if (static_cast<int>(pointers.size()) > 27) {
      m_ifbox = pointers[27];
    } else {
      m_ifbox = 0;
    }
    return;
  }

  if (flag == "ATOM_NAME") {
    readStrings(lin, fmt, m_atomNames, m_natom);
    return;
  }

  if (flag == "RESIDUE_LABEL") {
    readStrings(lin, fmt, m_resLabels, m_nres);
    return;
  }

  if (flag == "RESIDUE_POINTER") {
    readInts(lin, fmt, m_resPointers, m_nres);
    return;
  }

  if (flag == "ATOMIC_NUMBER") {
    readInts(lin, fmt, m_atomicNumbers, m_natom);
    return;
  }

  if (flag == "MASS") {
    readReals(lin, fmt, m_masses, m_natom);
    return;
  }

  if (flag == "AMBER_ATOM_TYPE") {
    readStrings(lin, fmt, m_amberTypes, m_natom);
    return;
  }

  if (flag == "BONDS_INC_HYDROGEN" || flag == "BONDS_WITHOUT_HYDROGEN") {
    // Each bond = 3 ints (atom1, atom2, parm_index). Atom indices are
    // coord-array offsets (atom_index * 3), so divide by 3 for 0-based AID.
    int nbonds = (flag == "BONDS_INC_HYDROGEN") ? m_nbonh : m_mbona;
    if (nbonds <= 0) return;
    std::vector<int> ints;
    readInts(lin, fmt, ints, nbonds * 3);
    for (int i = 0; i < nbonds; ++i) {
      int a = ints[i * 3 + 0] / 3;
      int b = ints[i * 3 + 1] / 3;
      m_bonds.emplace_back(a, b);
    }
    return;
  }

  // Unknown / unused section: skip its records.
  // We do not know the record count for unknown FLAGs in general, but most
  // optional sections have a fixed-shape count we can derive from POINTERS.
  // Without that mapping, read until the next %FLAG or EOF.
  // We approximate this by skipping all lines until the next line starting with '%'.
  // To do this without LineStream peek, we rely on the outer parseTopology loop:
  // when readFlagSection returns, parseTopology continues by reading until next %FLAG,
  // and any stray content lines are discarded. To match that contract, we simply
  // return here without consuming further lines, and let parseTopology skip them.
  // NOTE: parseTopology's "find next FLAG" loop is tolerant to stray lines, so this works.
}

int AmberPrmtopReader::resolveElement(int atomic_number, double mass,
                                      const LString &amber_type)
{
  if (atomic_number > 0 && atomic_number < 119) {
    // Map atomic number 1..118 directly via ElemSym.
    ElemID id = static_cast<ElemID>(atomic_number);
    return id;
  }

  // Mass-based fallback (matches PsfReader's table style, kept narrow).
  auto nearMass = [](double x, double y) { return (y - 0.5 < x) && (x < y + 0.5); };
  if (nearMass(mass, 1.008))   return ElemSym::H;
  if (nearMass(mass, 12.011))  return ElemSym::C;
  if (nearMass(mass, 14.007))  return ElemSym::N;
  if (nearMass(mass, 15.999))  return ElemSym::O;
  if (nearMass(mass, 18.998))  return ElemSym::F;
  if (nearMass(mass, 22.990))  return ElemSym::Na;
  if (nearMass(mass, 24.305))  return ElemSym::Mg;
  if (nearMass(mass, 30.974))  return ElemSym::P;
  if (nearMass(mass, 32.06))   return ElemSym::S;
  if (nearMass(mass, 35.45))   return ElemSym::Cl;
  if (nearMass(mass, 39.098))  return ElemSym::K;
  if (nearMass(mass, 40.078))  return ElemSym::Ca;
  if (nearMass(mass, 55.845))  return ElemSym::Fe;
  if (nearMass(mass, 65.38))   return ElemSym::Zn;
  if (nearMass(mass, 79.904))  return ElemSym::Br;
  if (nearMass(mass, 126.904)) return ElemSym::I;

  // Last-resort: first character of AMBER atom type.
  if (!amber_type.isEmpty()) {
    char c0 = amber_type.getAt(0);
    if (c0 >= 'a' && c0 <= 'z') c0 = static_cast<char>(c0 - 'a' + 'A');
    char buf[2] = { c0, '\0' };
    int id = ElemSym::str2SymID(LString(buf));
    if (id != ElemSym::XX) return id;
  }
  return ElemSym::XX;
}

void AmberPrmtopReader::buildMol()
{
  if (m_natom <= 0) {
    MB_THROW(qlib::FileFormatException, "POINTERS NATOM is zero or missing");
    return;
  }
  if (static_cast<int>(m_atomNames.size()) != m_natom) {
    MB_THROW(qlib::FileFormatException,
             LString::format("ATOM_NAME count %d != NATOM %d",
                             static_cast<int>(m_atomNames.size()), m_natom));
    return;
  }
  if (static_cast<int>(m_resLabels.size()) != m_nres ||
      static_cast<int>(m_resPointers.size()) != m_nres) {
    MB_THROW(qlib::FileFormatException,
             LString::format("RESIDUE_LABEL/POINTER count mismatch (labels=%d, pointers=%d, nres=%d)",
                             static_cast<int>(m_resLabels.size()),
                             static_cast<int>(m_resPointers.size()),
                             m_nres));
    return;
  }

  const bool hasAtomicNum = (static_cast<int>(m_atomicNumbers.size()) == m_natom);
  const bool hasMass = (static_cast<int>(m_masses.size()) == m_natom);
  const bool hasType = (static_cast<int>(m_amberTypes.size()) == m_natom);

  // residue_pointer[i] is 1-based first atom of residue i; residue i spans
  // [residue_pointer[i], residue_pointer[i+1]-1] (1-based, inclusive).
  // For the last residue, the span ends at m_natom.

  // Build residue lookup: for each 0-based atom index, find residue 0-based index.
  std::vector<int> atomToRes(m_natom, 0);
  for (int ires = 0; ires < m_nres; ++ires) {
    int begin0 = m_resPointers[ires] - 1;  // to 0-based
    int end0 = (ires + 1 < m_nres) ? (m_resPointers[ires + 1] - 1) : m_natom;
    if (begin0 < 0 || end0 > m_natom || begin0 >= end0) {
      MB_THROW(qlib::FileFormatException,
               LString::format("RESIDUE_POINTER inconsistent at residue %d (begin=%d, end=%d, natom=%d)",
                               ires, begin0, end0, m_natom));
      return;
    }
    for (int ia = begin0; ia < end0; ++ia) atomToRes[ia] = ires;
  }

  const LString chain(DEFAULT_CHAIN);

  // Append atoms.
  for (int ia = 0; ia < m_natom; ++ia) {
    int ires = atomToRes[ia];
    int atomic_number = hasAtomicNum ? m_atomicNumbers[ia] : 0;
    double mass = hasMass ? m_masses[ia] : 0.0;
    LString amber_type = hasType ? m_amberTypes[ia] : LString();
    int elemId = resolveElement(atomic_number, mass, amber_type);

    MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
    pAtom->setParentUID(m_pMol->getUID());
    pAtom->setName(m_atomNames[ia]);
    pAtom->setElement(static_cast<ElemID>(elemId));
    pAtom->setChainName(chain);
    pAtom->setResIndex(ResidIndex(ires + 1));  // 1-based residue number
    pAtom->setResName(m_resLabels[ires]);

    int aid = m_pMol->appendAtom(pAtom);
    if (aid < 0) {
      LString msg = LString::format("Failed to append atom %d (%s/%s/%d)",
                                    ia, chain.c_str(),
                                    m_resLabels[ires].c_str(), ires + 1);
      LOG_DPRINTLN("AmberPrmtopReader> %s", msg.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }
    // After appendAtom, MolCoord internally assigns an AID. For AMBER's
    // strictly-sequential ordering, atom index ia maps to atom AID ia.
    // We rely on this convention (same as NAMDCoorReader/PsfReader).
  }

  // Add the bonds declared in the file. In "autogen" mode the file bonds are
  // ignored and applyTopology() rebuilds them (PDB-like). The /3 conversion was
  // already done during section parsing.
  if (m_nBondMode != BONDMODE_AUTOGEN) {
    for (const auto &pr : m_bonds) {
      int a = pr.first;
      int b = pr.second;
      if (a < 0 || a >= m_natom || b < 0 || b >= m_natom) {
        LOG_DPRINTLN("AmberPrmtopReader> Skipping out-of-range bond (%d, %d)", a, b);
        continue;
      }
      m_pMol->makeBond(a, b, true);
    }
  }

  // In the default "file" mode the prmtop bonds are authoritative: mark every
  // residue "noautogen" so applyTopology() does not add distance-based bonds
  // (the same convention bond-aware formats like SDF/MOL2 use). This keeps
  // topology-DB polymer linking while avoiding spurious / zero-coordinate bonds.
  if (m_nBondMode == BONDMODE_FILE) {
    ResidIterator riter(m_pMol);
    for (riter.first(); riter.hasMore(); riter.next()) {
      MolResiduePtr pRes = riter.get();
      if (!pRes.isnull()) pRes->setPropStr("noautogen", "true");
    }
  }
}

bool AmberPrmtopReader::loadCoord()
{
  // The "coord" sub-stream (inpcrd / restrt) is optional. Without it the
  // user gets a topology-only load: all atoms exist with their default
  // (zero) positions. The UI lets the user pick a coord file via the
  // file-options dialog; if they skip it, getPath("coord") is empty.
  LString coord_path = getPath(LString("coord"));
  if (coord_path.isEmpty()) {
    LOG_DPRINTLN("AmberPrmtopReader> Warning: coord sub-stream is not attached.");
    LOG_DPRINTLN("AmberPrmtopReader>   The prmtop topology has been loaded, "
                 "but atom positions are undefined (zero).");
    LOG_DPRINTLN("AmberPrmtopReader>   To load coordinates, attach an inpcrd/"
                 "restrt file as the \"coord\" sub-stream via the file-options dialog.");
    return false;
  }

  std::unique_ptr<qlib::InStream> pSubIn(createInStream("coord"));
  qlib::ensureNotNull(pSubIn.get());

  AmberCrdReader crd;
  crd.attach(m_pMol);
  crd.read(*pSubIn);
  return true;
}
