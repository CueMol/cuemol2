// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD DCD binary trajectory file reader
//

#ifndef DCD_TRAJECTORY_READER_HPP_
#define DCD_TRAJECTORY_READER_HPP_

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <modules/molstr/molstr.hpp>

#include "TrajBlock.hpp"

namespace mdtools {

  class MolSelection;
  class Trajectory;

  using molstr::SelectionPtr;

  class MDTOOLS_API DCDTrajReader : public TrajBlockReader
  {
    MC_SCRIPTABLE;

    typedef TrajBlockReader super_t;

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

  private:
    int m_nSkip;

  public:
    int getSkipNo() const {
      return m_nSkip;
    }
      
    void setSkipNo(int n) {
      m_nSkip = n;
    }

  private:
    qlib::uid_t m_nTrajUID;
    
  public:
    qlib::uid_t getTargTrajUID() const { return m_nTrajUID; }
    void setTargTrajUID(qlib::uid_t uid) { m_nTrajUID = uid; }
    
  private:
    int m_natom;
    int m_nfile;
    bool m_fcell;
    
    void readHeader(qlib::InStream &ins);
    void readBody(qlib::InStream &ins);

    TrajectoryPtr getTargTraj() const;

    //////////

  private:
    qint64 m_nHeadPos;
    qlib::InStream *m_pIn;

  public:
    virtual void loadFrm(int ifrm, TrajBlock *pTB);
    

  };

}

#endif
