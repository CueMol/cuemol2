// -*-Mode: C++;-*-
//
// GROMACS GRO File reader class
//
// $Id$

#ifndef MDTOOLS_GRO_FILE_READER_HPP
#define MDTOOLS_GRO_FILE_READER_HPP

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/molstr/ResidIndex.hpp>

namespace qlib {
  class LineStream;
  class LClass;
}

namespace mdtools {

  using qlib::LString;
  using molstr::MolCoordPtr;
  using molstr::MolAtomPtr;

  ///
  ///   GROMACS GRO File (coord) reader class
  ///
  class MDTOOLS_API GROFileReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  public:


    /// (re)build protein secondary structure from the coordinates
    bool m_bBuild2ndry;


    /// auto generate unknown compound's topology
    bool m_bAutoTopoGen;
    
  private:
    /// Line input buffer
    LString m_recbuf;
    int m_lineno;

    /// building molecular coordinate obj
    MolCoordPtr m_pMol;

    /// building molecular coordinate obj
    TrajectoryPtr m_pTraj;

    /// Read atom count
    int m_nReadAtoms;

    /// All atom count (in header)
    int m_nAllAtoms;

    //////////////////////////////////////////////
  public:

    GROFileReader();

    virtual ~GROFileReader();

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    ///  Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;

    /// get file-type description
    virtual const char *getTypeDescr() const;

    /// get file extension
    virtual const char *getFileExt() const;

    /// create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

    // virtual int isSupportedFile(const char *fname, qlib::InStream *pins);

    //////////////////////////////////////////////

  private:

    void readContents(qlib::InStream &ins);

    ///
    ///  Copy start~end region of line buffer.
    ///   The returned region includes 'end' position,
    ///   e.g. length is (end-start+1).
    ///
    bool readRecord(qlib::LineStream &ins);
  
    ///
    ///  Copy start~end region of line buffer.
    ///  The returned region includes 'end' position,
    ///  e.g. length is (end-start+1).
    ///
    LString readStr(int start, int end) const
    {
      start --; end --;

      if (end >= m_recbuf.length())
	end = m_recbuf.length()-1;
      if (start<0)
	start = 0;
      if (start>end)
	start = end;

      return m_recbuf.substr(start, end-start+1);
    }

    LString readStrTrim(int start, int end) const
    {
      return readStr(start, end).trim();
    }

    void readInt(int start, int end, int *pnum) const
    {
      LString str = readStrTrim(start, end);
      if (str.isEmpty()) {
	LString msg = LString::format("Cannot read (%d-%d)", start, end);
	MB_THROW(qlib::FileFormatException, msg);
	return;
      }
      if (!str.toInt(pnum)) {
	LString msg = LString::format("<%s> is not an integer", str.c_str());
	MB_THROW(qlib::FileFormatException, msg);
	return;
      }
    }

    void readDouble(int start, int end, double *pnum) const
    {
      LString str = readStrTrim(start, end);
      if (str.isEmpty()) {
	LString msg = LString::format("Cannot read (%d-%d)", start, end);
	MB_THROW(qlib::FileFormatException, msg);
	return;
      }
      if (!str.toDouble(pnum)) {
	LString msg = LString::format("<%s> is not an integer", str.c_str());
	MB_THROW(qlib::FileFormatException, msg);
	return;
      }
    }

    bool isAvailStr(int start, int end) const
    {
      start --; end --;

      if (end >= m_recbuf.length())
	return false;
      if (start<0)
	return false;
      if (start>end)
	return false;

      return true;
    }

    char readChar(int start) const
    {
      start --;

      if (start >= m_recbuf.length())
	start = m_recbuf.length()-1;
      if (start<0)
	start = 0;

      return m_recbuf[start];
    }

    bool isAvailChar(int start) const
    {
      start --;

      if (start >= m_recbuf.length())
	return false;
      if (start<0)
	return false;

      return true;
    }

    bool checkAtomRecord(LString &chain, LString &resname, LString &atom);

    int convFromAname(const LString &atomname);

    /// read atom record and create MolAtom
    MolAtomPtr readAtom();


    void postProcess();

    //bool isAminoAcidName(const LString &nm) const;
    //bool isNuclAcidName(const LString &nm) const;
    //bool isOrganicAtom(int eleid) const;

  };

  /// File format exception
  // MB_DECL_EXCPT_CLASS(MOLSTR_API, PDBFileFormatException, qlib::FileFormatException);

}

#endif
