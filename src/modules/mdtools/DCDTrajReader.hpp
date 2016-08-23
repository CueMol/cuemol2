// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD DCD binary trajectory file reader
//

#ifndef DCD_TRAJECTORY_READER_HPP_
#define DCD_TRAJECTORY_READER_HPP_

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <qsys/ObjReader.hpp>
#include <molstr/molstr.hpp>

namespace mdtools {

  class MolSelection;
  class Trajectory;

  using molstr::SelectionPtr;

  class MDTOOLS_API DCDTrajReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  private:
    // /// target trajectory object
    // Trajectory *m_pTraj;
    
    // MolSelection *m_pSel;
    
    // std::vector<int> *m_pSelAtoms;
    
    // /// atom nums in the file
    // int m_nFileAtoms;
    
  private:
    int m_nSkip;

  public:
    int getSkipNo() const {
      return m_nSkip;
    }
      
    void setSkipNo(int n) {
      m_nSkip = n;
    }

    ///////////////////////////////////////////

  public:
    /// default constructor
    DCDTrajReader();
    
    /// destructor
    virtual ~DCDTrajReader();
    

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

    ///////////////////////////////////////////

    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);
    
    /////////////////////////////////////////////////////
    
    // /// set selection to read
    // void setSelToRead(const MolSelection *psel);
    
  private:
    int m_natom;
    int m_nfile;
    bool m_fcell;
    
    void readHeader(qlib::InStream &ins);
    void readBody(qlib::InStream &ins);
  };

}

#endif
