//
// Superclass of data input/output stream handler
//

#ifndef QSYS_IN_OUT_HANDER_HPP_INCLUDED
#define QSYS_IN_OUT_HANDER_HPP_INCLUDED

#include "qsys.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/MapTable.hpp>
// #include <qlib/StreamBundle.hpp>

namespace qlib {
  class InStream;
  class OutStream;
}

namespace qsys {

  using qlib::LString;

  class QSYS_API InOutHandler :
    public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

  private:

    typedef qlib::LNoCopyScrObject super_t;

    /// main/sub source path names
    qlib::MapTable<LString> m_stab;

  public:
    /// Category ID
    static const int IOH_CAT_OBJREADER = 0;
    static const int IOH_CAT_OBJWRITER = 1;
    /// Category ID for scene renderer
    static const int IOH_CAT_RENDTOFILE = 2;
    static const int IOH_CAT_SCEREADER = 3;
    static const int IOH_CAT_SCEWRITER = 4;

    static const int COMP_NONE = 0;
    static const int COMP_GZIP = 1;
    static const int COMP_BZIP2 = 2;
    static const int COMP_XZIP = 3;

    ///////////////////////////
    // Constructor / Destructor
    InOutHandler();

    virtual ~InOutHandler();

    ////////////////////////////////////////

    /// Get the nickname of this I/O handler (referred from script interface)
    virtual const char *getName() const =0;

    /// Get file-type description
    virtual const char *getTypeDescr() const =0;

    /// Get file extension
    virtual const char *getFileExt() const =0;

    /// Get category ID (obj reader/writer, scene exporter, etc)
    virtual int getCatID() const =0;

    /////////////
    // Main/Sub stream methods (interface)

    virtual LString getPath(const LString &key) const;
    virtual void setPath(const LString &key, const LString &path);
    
    // Create output stream (default impl: local file)
    virtual qlib::OutStream *createOutStream(const LString &key) const;

    // Create input stream (default impl: local file)
    virtual qlib::InStream *createInStream(const LString &key) const;

    /////////////
    // Compression setting
    // Default impl: not support compression (always returns COMP_NONE)

    virtual int getCompressMode() const;
    virtual void setCompressMode(int);

    // Base64 encoding flag
    // Default impl: not support base64 (always returns false)

    virtual bool getBase64Flag() const;
    virtual void setBase64Flag(bool);

    ////////////////////////////////////////
    // Main stream methods (shortcut method)

    LString getPath() const {
      return getPath(LString());
    }
    void setPath(const LString &path) {
      return setPath(LString(), path);
    }

    qlib::OutStream *createOutStream() const {
      return createOutStream(LString());
    }
    qlib::InStream *createInStream() const {
      return createInStream(LString());
    }

    ////////////////////////////////
    // Serialization/Deserialization

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    ////////////////////////////////
    // I/O Benchmark

  private:
    void *m_pTimerObj;

  public:
    void startTimerMes();
    void endTimerMes();

  };

}

#endif

