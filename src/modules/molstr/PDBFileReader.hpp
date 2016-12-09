// -*-Mode: C++;-*-
//
// PDB File reader class
//
// $Id: PDBFileReader.hpp,v 1.11 2011/03/28 14:55:08 rishitani Exp $

#ifndef PDB_FILE_READER_HPP__
#define PDB_FILE_READER_HPP__

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>
#include "ResidIndex.hpp"

namespace qlib {
  class LineStream;
  class LClass;
}

namespace molstr {

  using qlib::LString;

  //
  ///   PDB File reader class
  //
  class MOLSTR_API PDBFileReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  public:
    /// load models of NMR structure
    bool m_bLoadMultiModel;

    ///  load anisotropic B factors
    bool m_bLoadAnisoU;

    /// load alternate conformations
    bool m_bLoadAltConf;

    /// (re)build protein secondary structure from the coordinates
    bool m_bBuild2ndry;

    /// use segid field as chain name
    bool m_bLoadSegID;

    /// auto generate unknown compound's topology
    bool m_bAutoTopoGen;
    
  private:
    /// Line input buffer
    LString m_recbuf;
    int m_lineno;

    /// building molecular coordinate obj
    MolCoordPtr m_pMol;

    /// current processing chain name / ptr
    LString m_curChainTag;
    MolChainPtr m_pCurChain;
    ResidIndex m_nPrevResIdx;

    /// helix/sheet information
    ResidSet m_helix;
    ResidSet m_helix310;
    ResidSet m_helixpi;
    ResidSet m_sheet;

    /// previous atom object
    MolAtomPtr m_pPrevAtom;

    /// Current model number (-1: not in any model sections)
    int m_nCurrModel;

    /// Default model number (-2: undefined)
    int m_nDefaultModel;

    /// Read atom count
    int m_nReadAtoms;

    int m_nErrCount;
    int m_nErrMax;

    int m_nDupAtoms;
    int m_nLostAtoms;

    //////////////////////////////////////////////
  public:

    PDBFileReader();

    virtual ~PDBFileReader();

    //////////////////////////////////////////////
    // Read/build methods
  
    /**
       Read from the input stream ins, and build the attached object.
    */
    virtual bool read(qlib::InStream &ins);

    //////////////////////////////////////////////
    // Information query methods

    /** get the nickname of this reader (referred from script interface) */
    virtual const char *getName() const;

    /** get file-type description */
    virtual const char *getTypeDescr() const;

    /** get file extension */
    virtual const char *getFileExt() const;

    /** create default object for this reader */
    virtual qsys::ObjectPtr createDefaultObj() const;

    // virtual int isSupportedFile(const char *fname, qlib::InStream *pins);

    //////////////////////////////////////////////

  private:

    void readContents(qlib::InStream &ins);

    /**
       Copy start~end region of line buffer.
       The returned region includes 'end' position,
       e.g. length is (end-start+1).
    */
    bool readRecord(qlib::LineStream &ins);
  
    /**
       Copy start~end region of line buffer.
       The returned region includes 'end' position,
       e.g. length is (end-start+1).
    */
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

    //
    /// process ATOM/HETATM record
    bool readAtom();

    /// process HELIX record
    bool readHelixRecord();

    /// process SHEET record
    bool readSheetRecord();

    void apply2ndry(const char *ss1, const char *ss2, const ResidSet &data);
    // void apply2ndry(bool bSheet, const ResidSet &data);

    void readAnisou();

    /// process SSBOND record
    bool readSSBond();

    /// process LINK record
    bool readLink();

    /// process REMARK record
    bool readRemark();
    
    void postProcess();

    bool isAminoAcidName(const LString &nm) const;
    bool isNuclAcidName(const LString &nm) const;
    bool isOrganicAtom(int eleid) const;

    void readError(const LString &recnam);

    // additional linkage data
    struct Linkage
    {
      bool bSSBond;

      LString ch1;
      ResidIndex resi1;
      LString aname1;
      char alt1;
        
      LString ch2;
      ResidIndex resi2;
      LString aname2;
      char alt2;
    };

    std::deque<Linkage> m_linkdat;

    //////////////////////////////////////////////////
    // PDB Record handler (common impl with PDBWriter)

  public:
    class RecordHandler
    {
    public:
      virtual ~RecordHandler() {}
      virtual const char *getRecordName() const =0;
      virtual bool read(const LString &record, MolCoord *pMol) =0;
      virtual bool write(LString &record, MolCoord *pMol) =0;
    };

    typedef qlib::MapPtrTable<RecordHandler> HndlrTab;
    static HndlrTab m_htab;

    static void registerHandler(RecordHandler *pH);
    static RecordHandler *getHandler(const LString &name);
    static void init();
    static void fini();

  };

  /// File format exception
  MB_DECL_EXCPT_CLASS(MOLSTR_API, PDBFileFormatException, qlib::FileFormatException);

}

#endif // PDB_File_H__
