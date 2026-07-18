// -*-Mode: C++;-*-
//
// String input/output streams
//
// $Id: StringStream.hpp,v 1.2 2009/05/04 18:01:21 rishitani Exp $

#ifndef STRING_INPUT_OUTPUT_STREAM_H__
#define STRING_INPUT_OUTPUT_STREAM_H__

#include "FormatStream.hpp"
#include "LString.hpp"
#include "LChar.hpp"
#include "ArrayIOImpl.hpp"
#include "qlib.hpp"
#include "LScrSmartPtr.hpp"

namespace qlib {

  class LByteArray;

  /// String input stream
  class QLIB_API StrInStream : public InStreamAdaptor
  {
    
  private:
    typedef detail::ArrayInImpl char_impl;
    sp<char_impl> m_pimpl;
    
  public:
    explicit StrInStream(const LString &in);
    
    /// Construction from null-terminated char array
    explicit StrInStream(const char *in);

    explicit StrInStream(const char *in, int nlen);
    
    explicit StrInStream(const LScrSp<LByteArray> pBuf);
    

    ~StrInStream() override;
    
    /// Copy ctor
    StrInStream(const StrInStream &r);

    /// Copy operator
    const StrInStream &operator=(const StrInStream &arg);

    bool ready() override;

    int read() override;
  
    int read(char *buf, int off, int len) override;

    void close() override;

    /** get implementation */
    impl_type getImpl() const override;

  }; // class StrInStream


  ////////////////////////////////////////

  class LByteArray;

  /// String / binary array output stream
  class QLIB_API StrOutStream : public OutStreamAdaptor
  {

  private:
    sp<detail::ArrayOutImpl> m_pimpl;

  public:
    StrOutStream() : m_pimpl(MB_NEW detail::ArrayOutImpl())
    {
    }
    
    /** copy ctor */
    StrOutStream(const StrOutStream &r) :m_pimpl(r.m_pimpl)
    {
    }

    /** copy operator */
    const StrOutStream &operator=(const StrOutStream &arg) {
      if(&arg!=this){
	m_pimpl = arg.m_pimpl;
      }
      return *this;
    }

    ~StrOutStream() override;
    
    int write(const char *buf, int off, int len) override;
    
    void write(int b) override;

    void flush() override;

    void close() override;

    /// Get implementation
    impl_type getImpl() const override;

    /// Get the written data as string
    LString getString() const;
    
    /// get the written data as C char array
    char *getData(int &nsize) const;

    /// Get the written data as ByteArray
    LScrSp<LByteArray> getByteArray() const;

  };
  
} // namespace qlib

#endif
