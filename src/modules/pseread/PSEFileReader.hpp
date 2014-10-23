// -*-Mode: C++;-*-
//
//  PyMOL Session File Reader
//

#ifndef PSE_FILE_READER_HPP_INCLUDED
#define PSE_FILE_READER_HPP_INCLUDED

#include "pseread.hpp"

#include <qsys/Scene.hpp>
#include <qsys/InOutHandler.hpp>

namespace qlib {
  class LDom2InStream;
}

namespace pseread {

  using qlib::LString;
  using qlib::LDom2Node;
  using qlib::LDataSrcContainer;
  using qsys::ScenePtr;

  class PSEREAD_API PSEFileReader : public qsys::InOutHandler
  {
    MC_SCRIPTABLE;

  private:

    ScenePtr m_pClient;

    //////////

  public:
    PSEFileReader();

    virtual ~PSEFileReader();

    /// Get category ID
    virtual int getCatID() const;

    virtual void read();

    ////////////////////////////////////////
    // Client management

    /// attach to and lock the target object
    virtual void attach(ScenePtr pScene);

    /// detach from the target object
    virtual ScenePtr detach();

    ScenePtr getClient() const { return m_pClient; }

    /////////////////////////////////
    // Attributes

    /// Get name of the writer
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    /*
  private:
    LString m_errmsg;

  public:
    /// Get error message
    LString getErrMsg() const {
      return m_errmsg;
    }
    */

  };

  ////////////////////////////////////////////////////////////


}

#endif

