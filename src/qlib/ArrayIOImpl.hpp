// -*-Mode: C++;-*-
//
// memory array input/output implementation
//
// $Id: ArrayIOImpl.hpp,v 1.1 2008/01/02 13:40:16 rishitani Exp $

#ifndef ARRAY_INPUT_OUTPUT_IMPL_H__
#define ARRAY_INPUT_OUTPUT_IMPL_H__

#include "qlib.hpp"
#include "LTypes.hpp"

#include "LStream.hpp"

namespace qlib {

  // implementation
  namespace detail {

    /// Array input stream implementation
    class QLIB_API ArrayInImpl : public InImpl
    {

    private:
      /// data
      std::vector<qbyte> m_data;
      int m_pos;

    public:
      ArrayInImpl() : InImpl(), m_pos(0) {}

      explicit ArrayInImpl(const qbyte *in, int len);
      
      bool ready() override;

      int read() override;

      int read(char *buf, int off, int len) override;
      
      ///
      /// Try to skip n bytes.
      /// @return the actual number of bytes skipped
      ///
      int skip(int n) override;

      void i_close() override;

      /// get source URI of this stream
      LString getSrcURI() const override;
    };
    
    /// Array output implementation
    class QLIB_API ArrayOutImpl : public OutImpl
    {

    public:
      typedef std::deque<qbyte> data_type;

    private:
      /// data
      data_type m_data;

    public:

      ArrayOutImpl() : OutImpl() {}

      int write(const char *buf, int off, int len) override;
    
      void write(int b) override;
      
      void flush() override;

      void o_close() override;
      
      /// get destination URI of this stream
      LString getDestURI() const override;

      const data_type *getData() const {
	return &m_data;
      }
    };

  }// namespace detail
    
}// namespace qlib

#endif
