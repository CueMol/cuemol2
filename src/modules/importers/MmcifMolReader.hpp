// -*-Mode: C++;-*-
//
// mmCIF format macromolecule structure reader class
//

#ifndef MMCIF_MOL_READER_HPP__
#define MMCIF_MOL_READER_HPP__

#include "importers.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>
#include <modules/molstr/molstr.hpp>

namespace qlib {
  class LineStream;
}

namespace importers {

  using qlib::LString;
  using molstr::MolCoord;
  using molstr::MolCoordPtr;
  using molstr::MolResiduePtr;

  //
  ///   mmCIF mol structure reader class
  //
  class IMPORTERS_API MmcifMolReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  public:

  private:
    /// Line input buffer
    LString m_recbuf;
    int m_lineno;

    /// building molecular coordinate obj
    MolCoordPtr m_pMol;

    /// Read atom count
    int m_nReadAtoms;

    /// load alternate conformations
    bool m_bLoadAltConf;

    ///  load anisotropic B factors
    bool m_bLoadAnisoU;

    bool m_bLoadSecstr;

    //////////////////////////////////////////////
  public:

    MmcifMolReader();

    virtual ~MmcifMolReader();

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    /// Read from the input stream ins, and build the attached object.
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

    bool readRecord(qlib::LineStream &ins);

    void readDataLine();

    void appendDataItem();

    void readLoopDataItem();

    int m_nState;

    LString m_strCatName;

    static const int MMCIFMOL_INIT = 0;
    static const int MMCIFMOL_DATA = 1;
    static const int MMCIFMOL_LOOPDEF = 2;
    static const int MMCIFMOL_LOOPDATA = 3;

    void resetLoopDef();

    std::deque<LString> m_loopDefs;

    bool m_bLoopDefsOK;

    void readAtomLine();
    void readAnisoULine();

    // atom_site data items
    int m_nID;
    int m_nTypeSymbol;
    int m_nLabelAtomID;
    int m_nLabelAltID;
    int m_nLabelCompID;
    int m_nLabelSeqID;
    int m_nLabelAsymID;
    int m_nInsCode;
    int m_nCartX;
    int m_nCartY;
    int m_nCartZ;
    int m_nOcc;
    int m_nBfac;

    int m_nAuthAtomID;
    int m_nAuthCompID;
    int m_nAuthSeqID;
    int m_nAuthAsymID;

    std::vector<int> m_recStPos;
    std::vector<int> m_recEnPos;

    int findDataItem(const char *key) const {
      std::deque<LString>::const_iterator i = m_loopDefs.begin();
      std::deque<LString>::const_iterator iend = m_loopDefs.end();
      for (int j=0; i!=iend; ++i, ++j) {
        if (i->equals(key))
          return j;
      }
      return -1;
    }

    static const int TOK_FIND_START = 0;
    static const int TOK_FIND_END = 1;
    static const int TOK_FIND_QUOTEND = 2;

    void tokenizeLine();

    LString getToken(int n) const {
      if (n<0||n>=m_recStPos.size()) {
        MB_THROW(qlib::RuntimeException, "mmCIF data item not found");
        return LString();
      }
      int ist = m_recStPos[n];
      int ien = m_recEnPos[n];
      return m_recbuf.substr(ist, ien-ist);
    }

    std::map<int, int> m_atommap;
    
    // atom_site_aniso
    int m_nU11;
    int m_nU22;
    int m_nU33;
    int m_nU12;
    int m_nU13;
    int m_nU23;
    
    typedef std::map<quint32, MolResiduePtr> ResidTab;
    ResidTab m_residTab;

    MolResiduePtr findResid(int nSeqID) const;

    void readHelixLine();
    void readSheetLine();
    int m_nStSeqID;
    int m_nEnSeqID;
    int m_nHlxClass;

    typedef std::deque<std::pair<int,int> > SecStrList;
    SecStrList m_rngHelix;
    SecStrList m_rng310Helix;
    SecStrList m_rngPiHelix;
    SecStrList m_rngSheet;

    //void applySecstr();
    void applySecstr(const LString &sec, const LString &sec2, const SecStrList &rng);

    void readConnLine();

    int m_nConnTypeID;
    int m_nSeqID1;
    int m_nAtomID1;
    int m_nAltID1;
    int m_nSymmID1;
    int m_nSeqID2;
    int m_nAtomID2;
    int m_nAltID2;
    int m_nSymmID2;

    struct Linkage
    {
      int resi1;
      LString aname1;
      LString alt1;
      int resi2;
      LString aname2;
      LString alt2;
    };

    std::deque<Linkage> m_linkdat;

    void applyLink();
  };


  /// File format exception
  MB_DECL_EXCPT_CLASS(IMPORTERS_API, MmcifFormatException, qlib::FileFormatException);

}

#endif // PDB_File_H__
