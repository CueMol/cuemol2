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
    ~ObjReader() override;

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
    const char *getName() const override =0;

    /// get file-type description
    const char *getTypeDescr() const override =0;

    /// get file extension
    const char *getFileExt() const override =0;

    int getCatID() const override { return IOH_CAT_OBJREADER; }

    //////////////////////////////////////////////
    // Content sniffing (tri-state)
    //
    // See docs/architecture/objreader-content-sniff.md for the cap
    // contract (callers may wrap `ins` in a LimitedInStream), the
    // NO-vs-UNKNOWN policy, and the LineStream / minimum-byte
    // implementation patterns shared by every reader.

    /// Tri-state verdict returned from canHandleContent().
    /// YES: this reader recognizes the content as its own format.
    /// NO:  this reader recognizes the content as another format.
    /// UNKNOWN: no opinion (default for readers that don't implement sniffing).
    enum {
      CONTENT_NO = 0,
      CONTENT_YES = 1,
      CONTENT_UNKNOWN = 2
    };

    /// Inspect a peeked head buffer and decide whether this reader can
    /// handle the file content. The default implementation returns
    /// CONTENT_UNKNOWN; subclasses that can fingerprint their format
    /// should override.
    virtual int canHandleContent(qlib::InStream &ins) const
    {
      return CONTENT_UNKNOWN;
    }

    int getCompressMode() const override;
    void setCompressMode(int) override;

    bool getBase64Flag() const override;
    void setBase64Flag(bool) override;

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
