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
#include <modules/molstr/ResidIndex.hpp>
#include <modules/xtal/CifParser.hpp>

namespace qlib {
  class LineStream;
}

namespace importers {

  using qlib::LString;
  using molstr::MolCoord;
  using molstr::MolCoordPtr;
  using molstr::MolResiduePtr;
  using molstr::ResidIndex;
  using molstr::ResidSet;
  using xtal::CifParser;
  using xtal::CifParserClient;

  //
  ///   mmCIF mol structure reader class
  //
class IMPORTERS_API MmcifMolReader : public qsys::ObjReader, CifParserClient
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

  public:
    //////////////////////////////////////////////
    // properties

    /// load multiple models
    bool m_bLoadMultiModel;

    /// load alternate conformations
    bool m_bLoadAltConf;

    ///  load anisotropic B factors
    bool m_bLoadAnisoU;

    /// Load protein secondary structure from the file
    bool m_bLoadSecstr;
    
    /// Auto generate unknown compound's topology
    bool m_bAutoTopoGen;

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

    //////////////////////////////////////////////

    virtual void readDataItem(CifParser &parser);


  private:
    void readAtomLine(CifParser &parser);
    void readAnisoULine(CifParser &parser);

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
    int m_nModelID;

    LString getAtomID(CifParser &parser, int auth_id, int label_id) {
        LString atom_id;
        if (auth_id>=0)
            atom_id = parser.getToken(auth_id);
        else if (label_id>=0)
            atom_id = parser.getToken(label_id);
        else
            return "";

        // remove double-quotations
        if (atom_id.getAt(0)=='"')
            atom_id = atom_id.substr(1, atom_id.length()-2);

        return atom_id;
    }


    LString getCompID(CifParser &parser, int auth_id, int label_id) {
        LString comp_id;
        if (auth_id>=0)
            comp_id = parser.getToken(auth_id);
        else if (label_id>=0)
            comp_id = parser.getToken(label_id);
        else
            return "";

        return comp_id;
    }

    LString getAsymID(CifParser &parser, int auth_id, int label_id) {
        LString asym_id;
        if (auth_id>=0)
            asym_id = parser.getToken(auth_id);
        else if (label_id>=0)
            asym_id = parser.getToken(label_id);
        else
            // ERROR!!
            return "";
        // conv unnamed chain ("?") to "_"
        if (asym_id == "?")
            asym_id = "_";
        else if (asym_id.isEmpty())
            asym_id = "_";
        return asym_id;
    }

#ifdef HAVE_UNORDERED_MAP
    typedef std::unordered_map<int, int> AtomIDMap;
#else
    typedef boost::unordered_map<int, int> AtomIDMap;
#endif
    AtomIDMap m_atommap;
    
    // atom_site_aniso
    int m_nU11;
    int m_nU22;
    int m_nU33;
    int m_nU12;
    int m_nU13;
    int m_nU23;
    
    void readHelixLine(CifParser &parser);
    void readSheetLine(CifParser &parser);

    ResidSet m_helix;
    ResidSet m_helix310;
    ResidSet m_helixpi;
    ResidSet m_sheet;

    void apply2ndry(const char *ss1, const char *ss2, const ResidSet &data);

    void readConnLine(CifParser &parser);

    int m_nConnTypeID;
    int m_nAuthChainID1;
    int m_nLabelChainID1;
    int m_nAuthSeqID1;
    int m_nLabelSeqID1;
    int m_nAuthAtomID1;
    int m_nLabelAtomID1;
    int m_nInsID1;
    int m_nAltID1;
    int m_nSymmID1;

    int m_nAuthChainID2;
    int m_nLabelChainID2;
    int m_nAuthSeqID2;
    int m_nLabelSeqID2;
    int m_nAuthAtomID2;
    int m_nLabelAtomID2;
    int m_nInsID2;
    int m_nAltID2;
    int m_nSymmID2;
    int m_nHlxClass;

    struct Linkage
    {
      LString ch1;
      ResidIndex resi1;
      LString aname1;
      char alt1;

      LString ch2;
      ResidIndex resi2;
      LString aname2;
      char alt2;

      LString orig_line;
    };

    std::deque<Linkage> m_linkdat;

    void applyLink();

    void readCellLine(CifParser &parser);
    void readSymmLine(CifParser &parser);

    ResidIndex getResidIndex(CifParser &parser, int nSeqID, int nInsID);
    ResidIndex getResidIndex(CifParser &parser, int nAuthSeqID, int nLabelSeqID, int nInsID);
    char getConfID(CifParser &parser, int nConfID);

    void error(const LString &msg) const;
    void warning(const LString &msg) const;
  };


  /// File format exception
  MB_DECL_EXCPT_CLASS(IMPORTERS_API, MmcifFormatException, qlib::FileFormatException);

}

#endif // PDB_File_H__
