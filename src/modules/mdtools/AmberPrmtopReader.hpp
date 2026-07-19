// -*-Mode: C++;-*-
//
// AMBER prmtop (parm7) topology reader class
//

#ifndef AMBER_PRMTOP_READER_HPP__
#define AMBER_PRMTOP_READER_HPP__

#include "mdtools.hpp"

#include <utility>
#include <vector>

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LString.hpp>
#include <qsys/ObjReader.hpp>
#include <modules/molstr/molstr.hpp>

namespace qlib {
  class LClass;
  class LineStream;
}

namespace mdtools {

  using qlib::LString;
  using molstr::MolCoordPtr;

  ///
  ///   AMBER prmtop / parm7 (Amber 7+ new format) topology reader.
  ///   Acts as the main ObjReader (creates MolCoord) and pulls the
  ///   coordinate sub-stream "coord" (inpcrd / restrt) through the
  ///   AmberCrdReader helper.
  ///
  class MDTOOLS_API AmberPrmtopReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  private:
    /// building molecular coordinate obj
    MolCoordPtr m_pMol;

    /// POINTERS counts (from the POINTERS FLAG)
    int m_natom;
    int m_nres;
    int m_nbonh;
    int m_mbona;
    int m_ifbox;

    /// ATOM_NAME entries (size = natom)
    std::vector<LString> m_atomNames;

    /// RESIDUE_LABEL entries (size = nres)
    std::vector<LString> m_resLabels;

    /// RESIDUE_POINTER entries (size = nres). 1-based first-atom index for each residue.
    std::vector<int> m_resPointers;

    /// ATOMIC_NUMBER entries (size = natom). Empty if FLAG absent (Amber 7-11).
    std::vector<int> m_atomicNumbers;

    /// MASS entries (size = natom). Used as element-resolution fallback when ATOMIC_NUMBER missing.
    std::vector<double> m_masses;

    /// AMBER_ATOM_TYPE entries (size = natom). Last-resort fallback.
    std::vector<LString> m_amberTypes;

    /// Bonds: pairs of 0-based atom indices (after dividing the raw prmtop indices by 3).
    std::vector<std::pair<int, int>> m_bonds;

    /// Bond-building mode (BONDMODE_*), from the "bondmode" reader option.
    int m_nBondMode;

    //////////////////////////////////////////////
  public:

    AmberPrmtopReader();

    ~AmberPrmtopReader() override;

    //////////////////////////////////////////////
    // Read/build methods

    // Bring the base-class no-argument read() back into scope (otherwise
    // the override below hides it under C++ name-lookup rules).
    using qsys::ObjReader::read;

    /// Read prmtop from ins, build attached MolCoord, then load coord sub-stream.
    bool read(qlib::InStream &ins) override;

    /// Content sniff: prmtop new format starts with %VERSION or %FLAG.
    int canHandleContent(qlib::InStream &ins) const override;

    //////////////////////////////////////////////
    // Information query methods

    const char *getName() const override;

    const char *getTypeDescr() const override;

    const char *getFileExt() const override;

    qsys::ObjectPtr createDefaultObj() const override;

    //////////////////////////////////////////////
    // Bond-building mode (reader option "bondmode")

    /// Use the bonds declared in the file; suppress distance autogen (default).
    static constexpr int BONDMODE_FILE = 0;
    /// Use file bonds and also let applyTopology augment (TopoDB + distance).
    static constexpr int BONDMODE_HYBRID = 1;
    /// Ignore file bonds; rebuild via applyTopology (PDB-like).
    static constexpr int BONDMODE_AUTOGEN = 2;

    int getBondMode() const { return m_nBondMode; }
    void setBondMode(int n) { m_nBondMode = n; }

    //////////////////////////////////////////////

  private:

    /// Parse prmtop top-level structure (header + FLAG sections).
    void parseTopology(qlib::InStream &ins);

    /// Construct MolAtom / MolResidue / MolBond from parsed buffers.
    void buildMol();

    /// Open the "coord" sub-stream and apply the snapshot to m_pMol.
    /// Returns true if real coordinates were read, false for a topology-only
    /// load (no "coord" sub-stream; atoms keep their default zero positions).
    bool loadCoord();

    /// Read one section's payload according to fmt and dispatch by FLAG name.
    void readFlagSection(qlib::LineStream &lin,
                         const LString &flag,
                         const LString &fmt);

    /// Skip count records of width 'width' (nrec per line).
    void skipRecords(qlib::LineStream &lin, int nrec, int count);

    /// Parsed FORTRAN format like "5E16.8", "20a4", "10I8".
    /// Width is per record; nrec is records per line.
    struct FortFmt {
      int nrec;
      int width;
      char type;  ///< 'a' | 'I' | 'E' | 'F'
      FortFmt() : nrec(0), width(0), type('\0') {}
    };

    /// Parse "%FORMAT(...)" content (the part inside the parentheses).
    static FortFmt parseFortFmt(const LString &spec);

    /// Read 'count' int records.
    static void readInts(qlib::LineStream &lin, const FortFmt &fmt,
                         std::vector<int> &out, int count);

    /// Read 'count' real records.
    static void readReals(qlib::LineStream &lin, const FortFmt &fmt,
                          std::vector<double> &out, int count);

    /// Read 'count' fixed-width string records (trimmed).
    static void readStrings(qlib::LineStream &lin, const FortFmt &fmt,
                            std::vector<LString> &out, int count);

    /// Resolve element ID using prmtop atomic number, mass, or AMBER atom type.
    static int resolveElement(int atomic_number, double mass,
                              const LString &amber_type);
  };

}

#endif
