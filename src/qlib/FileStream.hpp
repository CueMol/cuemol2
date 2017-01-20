// -*-Mode: C++;-*-
//
// File input/output streams
//
// $Id: FileStream.hpp,v 1.2 2009/12/13 10:35:51 rishitani Exp $

#ifndef FILE_INPUT_OUTPUT_STREAM_H__
#define FILE_INPUT_OUTPUT_STREAM_H__

#include "qlib.hpp"

#include "LStream.hpp"
#include "SmartPtr.hpp"

namespace qlib {

  class LString;

  // implementation
  namespace detail {
    ///
    ///  Interface for implementation class of file I/O
    ///
    class QLIB_API AbstFIOImpl : public IOImpl {
    public:

      virtual ~AbstFIOImpl() {}

      /// open file stream for reading
      virtual void i_open(const LString &fname) =0;

      /// open file stream for writing
      virtual void o_open(const LString &fname, bool bAppend) =0;

      /**
	 seek operation
	 mode: 0 = get file pos
	       1 = set file pos (absolute)
	       2 = set file pos (relative)
      */
      virtual qint64 seek(qint64 pos, int mode) =0;

      /// Get information about the accessing file
      virtual LString getPathName() const =0;

    };
  }
  
  ///////////////////////////////////////////////////////

  /// File input stream 
  class QLIB_API FileInStream : public InStream
  {
  private:
    sp<detail::AbstFIOImpl> m_pimpl;

  public:
    FileInStream();

    /// copy ctor
    FileInStream(const FileInStream &r);

    /// copy operator
    const FileInStream &operator=(const FileInStream &arg)
    {
      if(&arg!=this){
	m_pimpl = arg.m_pimpl;
      }
      return *this;
    }

    /// dtor
    virtual ~FileInStream();
    
    //////////////////////////////////////////////////////

    /** open the file */
    void open(const LString &fname);

    virtual bool ready();
    
    virtual int read();
  
    virtual int read(char *buf, int off, int len);

    virtual int skip(int len);

    virtual void close();

    virtual LString getURI() const;

    /// get implementation
    virtual impl_type getImpl() const;

    //////////////////////////////////////////////////////

    virtual bool isSeekable() const;

    virtual qint64 getFilePos() const;

    virtual void setFilePos(qint64 pos);

    // get standard input stream
    static FileInStream &getStdIn();

  }; // class FileInStream

  ///////////////////////////////////////////////////////////

  ///
  /// File output stream
  ///
  class QLIB_API FileOutStream : public qlib::OutStream
  {

  private:
    sp<detail::AbstFIOImpl> m_pimpl;

  public:
    FileOutStream();

    /** copy ctor */
    FileOutStream(const FileOutStream &r);

    /** copy operator */
    const FileOutStream &operator=(const FileOutStream &arg) {
      if(&arg!=this){
	m_pimpl = arg.m_pimpl;
      }
      return *this;
    }

    /// dtor
    virtual ~FileOutStream();
    
    //////////////////////////////////////////////////////

    /// open the file
    void open(const LString &fname, bool bAppend = false) {
      m_pimpl->o_open(fname, bAppend);
    }

    virtual int write(const char *buf, int off, int len);
    
    virtual void write(int b);

    virtual void flush();

    virtual void close();

    virtual LString getURI() const;
    

    /// get implementation
    virtual impl_type getImpl() const;

    //////////////////////////////////////////////////////

    qint64 getFilePos();
    
    void setFilePos(qint64 pos);

    /// get standard output stream
    static FileOutStream &getStdOut();

    /// get standard error stream
    static FileOutStream &getStdErr();

  };

} // namespace qlib

#endif
