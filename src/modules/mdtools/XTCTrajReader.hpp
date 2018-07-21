// -*-Mode: C++;-*-
//
// Gromacs XTC binary trajectory file reader
//

#ifndef XTC_TRAJECTORY_READER_HPP
#define XTC_TRAJECTORY_READER_HPP

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <modules/molstr/molstr.hpp>

#include "TrajBlock.hpp"

namespace mdtools {

  class MolSelection;
  class Trajectory;

  using molstr::SelectionPtr;

  class MDTOOLS_API XTCTrajReader : public TrajBlockReader
  {
    MC_SCRIPTABLE;

    typedef TrajBlockReader super_t;

    ///////////////////////////////////////////

  public:
    /// default constructor
    XTCTrajReader();
    
    /// destructor
    virtual ~XTCTrajReader();
    

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

    /// Read from the input stream ins, and build the attached object.
    virtual bool read(qlib::InStream &ins);
    
    /// lazy load interface (called from TrajBlock::load(ifrm))
    virtual void loadFrm(int ifrm, TrajBlock *pTB);
    
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

    void readHeader(qlib::InStream &ins);
    void readBody(qlib::InStream &ins);
    

  };

}

#endif
