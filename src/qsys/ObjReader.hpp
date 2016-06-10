// -*-Mode: C++;-*-
//
// Object reader / Construct object from an input stream
//
// $Id: ObjReader.hpp,v 1.6 2010/02/17 14:37:01 rishitani Exp $

#ifndef QSYS_OBJECT_READER_HPP__
#define QSYS_OBJECT_READER_HPP__

#include "qsys.hpp"

#include <qlib/LString.hpp>
#include <qlib/LStream.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LDynamic.hpp>
#include "InOutHandler.hpp"
#include "Object.hpp"

using qlib::LString;

namespace qsys {

  class QSYS_API ObjReader : public InOutHandler
  {
    MC_SCRIPTABLE;

    typedef InOutHandler super_t;

    //////////////////////////////////////////////
  private:
    ObjectPtr m_pTarget;

    int m_nCompMode;
    bool m_fUseBase64;

  public:
    ObjReader();
    virtual ~ObjReader();

    //////////////////////////////////////////////
    // Read/build methods
  
    /// attach to and lock the target object
    virtual void attach(ObjectPtr pObj);
    
    /// detach from the target object
    virtual ObjectPtr detach();
    
    /// Read from the stream to build the attached object
    virtual bool read(qlib::InStream &ins) =0;

    /// Create default object for this reader
    virtual ObjectPtr createDefaultObj() const =0;

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    virtual const char *getName() const =0;

    /// get file-type description
    virtual const char *getTypeDescr() const =0;

    /// get file extension
    virtual const char *getFileExt() const =0;

    virtual int getCatID() const { return IOH_CAT_OBJREADER; }

    /*
    enum {
      SF_NOIMPL, // operation not implemented
      SF_UNKNOWN, // unknown file type
      SF_SUPPORTED // OK
    };

    virtual int isSupportedFile(const char *fname, qlib::InStream *pins);
    */

    virtual int getCompressMode() const;
    virtual void setCompressMode(int);

    virtual bool getBase64Flag() const;
    virtual void setBase64Flag(bool);

    //////////////////////////////////////////////
    // Convenience methods

    /// Read from the default stream
    void read();
    
    /// Read with compression or base64 decoding
    void read2(qlib::InStream &ins);

    ///
    ///  Create default obj and read from the input stream.
    ///
    ObjectPtr load(qlib::InStream &ins);

  protected:
    template <class T>
    T *getTarget() const {
      return static_cast<T *>(m_pTarget.get());
    }

  };
}

#endif // OBJECT_READER_H__
