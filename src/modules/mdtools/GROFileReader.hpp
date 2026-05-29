// -*-Mode: C++;-*-
//
// GROMACS .gro coordinate file reader class
//

#ifndef GRO_FILE_READER_HPP__
#define GRO_FILE_READER_HPP__

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
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
  ///   GROMACS .gro file reader class
  ///
  class MDTOOLS_API GROFileReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  private:
    /// building molecular coordinate obj
    MolCoordPtr m_pMol;

    /// current line number (1-origin)
    int m_lineno;

    /// declared atom count from line 2
    int m_nDeclAtoms;

    /// number of atoms actually read
    int m_nReadAtoms;

    /// position field width (default 8 for %8.3f, larger for high precision)
    int m_nPosWidth;

    /// title line text
    LString m_title;

    /// chain name assigned to all atoms (.gro has no chain concept)
    LString m_curChain;

    //////////////////////////////////////////////
  public:

    GROFileReader();

    virtual ~GROFileReader();

    //////////////////////////////////////////////
    // Read/build methods

    /// Read from the input stream ins, and build the attached object.
    virtual bool read(qlib::InStream &ins);

    /// Content sniff: validate that line 2 is a non-negative integer and
    /// line 3 has the GRO fixed-column layout (>= 44 chars with three
    /// parseable doubles at columns 20/28/36).
    virtual int canHandleContent(qlib::InStream &ins) const;

    //////////////////////////////////////////////
    // Information query methods

    virtual const char *getName() const;

    virtual const char *getTypeDescr() const;

    virtual const char *getFileExt() const;

    virtual qsys::ObjectPtr createDefaultObj() const;

    //////////////////////////////////////////////

  private:

    /// Read one frame (title, count, N atom lines, box). Returns false
    /// if the stream is exhausted before any frame can be read.
    bool readFrame(qlib::LineStream &lin);

    /// Determine position field width from the first atom line.
    void determineFieldLayout(const LString &line);

    /// Parse one atom line and append a MolAtom to m_pMol.
    void parseAtomLine(const LString &line);

    /// Parse the box vector line and attach CrystalInfo to m_pMol.
    void parseBoxLine(const LString &line);

    /// Guess element ID from atom name (1-2 char prefix lookup).
    int guessElement(const LString &aname) const;

  };

  /// File format exception
  MB_DECL_EXCPT_CLASS(MDTOOLS_API, GROFileFormatException, qlib::FileFormatException);

}

#endif
