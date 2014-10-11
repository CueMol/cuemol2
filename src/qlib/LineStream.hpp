// -*-Mode: C++;-*-
//
// line input formatter class
//
// $Id: LineStream.hpp,v 1.2 2009/05/04 18:01:21 rishitani Exp $

#ifndef LINE_INPUT_STREAM_H__
#define LINE_INPUT_STREAM_H__

#include "qlib.hpp"

#include "FilterStream.hpp"
#include "LString.hpp"

namespace qlib {

  namespace detail {

    /** implementation for LineStream */
    class QLIB_API LineInImpl : public InFilterImpl {
    private:
      /** current line number */
      int m_lineNo;
      
      /** buffer */
      LString m_buf;

      /** delimitor */
      LString m_delim;

    public:

      LineInImpl() : m_lineNo(0), m_delim("\n") {}

      LineInImpl(const impl_type &in)
        : InFilterImpl(in), m_lineNo(0), m_delim("\n")
      {
      }

      virtual bool ready();

      void readLine(LString &r);

      int getLineNo() const { return m_lineNo; }
      void setLineNo(int n) { m_lineNo = n; }

      /** set delimitor */
      void setDelim(const LString &s) { m_delim = s; }
      
      /** get current delimitor */
      const LString &getDelim() const { return m_delim; }

    }; // class LineInImpl

  } // namespace detail

  ///////////////////////////////////////////////////////////

  class QLIB_API LineStream : public InStreamAdaptor
  {
  public:
    typedef InStreamAdaptor super_t;

  private:
    sp<detail::LineInImpl> m_pimpl;

  public:
    LineStream()
    {
    }

    explicit LineStream(InStream &r)
      : m_pimpl(MB_NEW detail::LineInImpl(r.getImpl()))
    {
    }

    /** create copy sharing the same implementation */
    explicit LineStream(LineStream &r) : m_pimpl(r.m_pimpl)
    {
    }

    /** copy operator */
    LineStream &operator=(LineStream &arg) {
      if(&arg!=this){
	m_pimpl = arg.m_pimpl;
      }
      return *this;
    }

    /** copy operator */
    LineStream &operator=(InStream &arg) {
      m_pimpl = sp<detail::LineInImpl>(MB_NEW detail::LineInImpl(arg.getImpl()));
      return *this;
    }

    //////////////////////////////

    /** set delimitor */
    void setDelim(const LString &s) { m_pimpl->setDelim(s); }

    /** get current delimitor */
    const LString &getDelim() const { return m_pimpl->getDelim(); }

    /** read one line */
    LString readLine() {
      LString r;
      m_pimpl->readLine(r);
      return r;
    }

    /** get current line number */
    int getLineNo() const { return m_pimpl->getLineNo(); }

    /** set line number */
    void setLineNo(int n) { m_pimpl->setLineNo(n); }

    /** get implementation */
    virtual impl_type getImpl() const {
      return m_pimpl;
    }

  };

} // namespace qlib

#endif
