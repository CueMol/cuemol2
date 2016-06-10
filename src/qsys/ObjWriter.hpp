// -*-Mode: C++;-*-
//
// Object writer
//
// $Id: ObjWriter.hpp,v 1.4 2010/10/31 13:36:49 rishitani Exp $

#ifndef QSYS_OBJECT_WRITER_HPP__
#define QSYS_OBJECT_WRITER_HPP__

#include "qsys.hpp"
#include "Object.hpp"

#include <qlib/LStream.hpp>
#include <qlib/LExceptions.hpp>
#include "InOutHandler.hpp"

using qlib::LString;

namespace qsys {

  class QSYS_API ObjWriter : public InOutHandler
  {
    MC_SCRIPTABLE;

    typedef InOutHandler super_t;

  private:
    ObjectPtr m_pTarget;
    
    int m_nCompMode;
    bool m_fUseB64;

  protected:
    template <class T> T *getTarget() const {
      return static_cast<T *>(m_pTarget.get());
    }

  public:
    ObjWriter();
    virtual ~ObjWriter();

    //////////////////////////////////////////////
  
    /// attach to and lock the target object
    virtual void attach(ObjectPtr pObj);
    
    /// detach from the target object
    virtual ObjectPtr detach();
    
    /// write to the stream
    virtual bool write(qlib::OutStream &outs) =0;
    
    /// get the nickname of this writer (referred from script interface)
    virtual const char *getName() const =0;

    /// get file-type description
    virtual const char *getTypeDescr() const =0;
    
    /// get file extension 
    virtual const char *getFileExt() const =0;
    
    virtual bool canHandle(ObjectPtr pobj) const =0;

    virtual int getCatID() const { return IOH_CAT_OBJWRITER; }

    //////////

    virtual int getCompressMode() const;
    virtual void setCompressMode(int);

    virtual bool getBase64Flag() const;
    virtual void setBase64Flag(bool);

    bool isConvToLink() const;
    void setConvToLink(bool);

  private:
    bool m_bConvToLink;

  public:
    //////////////////////////////////////////////
    // Convenience methods

    /// write to the default stream
    void write();

    /// Write with compression or base64 decoding
    void write2(qlib::OutStream &outs);

  };
}

#endif // OBJECT_READER_H__

