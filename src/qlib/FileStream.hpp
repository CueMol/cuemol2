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
    /**
       Interface for implementation class of file I/O
    */
    class QLIB_API AbstFIOImpl : public IOImpl {
    public:

      ~AbstFIOImpl() override {}

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
      virtual int seek(int pos, int mode) =0;

      /// Get information about the accessing file
      virtual LString getPathName() const =0;

      //virtual LString getAbsPath() const =0;
      //virtual LString getDirName() const =0;
    };
  }
  
  /** superclass of file input stream */
  class QLIB_API FileInStream : public InStream {

  private:
    sp<detail::AbstFIOImpl> m_pimpl;

  public:
    FileInStream();

    /** copy ctor */
    FileInStream(const FileInStream &r);

    /** copy operator */
    const FileInStream &operator=(const FileInStream &arg) {
      if(&arg!=this){
	m_pimpl = arg.m_pimpl;
      }
      return *this;
    }

    /** dtor */
    ~FileInStream() override;
    
    //////////////////////////////////////////////////////

    /** open the file */
    void open(const LString &fname) {
      m_pimpl->i_open(fname);
    }

    bool ready() override {
      return m_pimpl->ready();
    }

    int read() override {
      return m_pimpl->read();
    }
  
    int read(char *buf, int off, int len) override {
      return m_pimpl->read(buf, off, len);
    }

    int skip(int len) override {
      return m_pimpl->skip(len);
    }

    void close() override {
      m_pimpl->i_close();
    }

    LString getURI() const override {
      return m_pimpl->getSrcURI();
    }

    /** get implementation */
    impl_type getImpl() const override {
      return m_pimpl;
    }

    //////////////////////////////////////////////////////

    /// Current file position (64-bit); -1 when the source cannot seek
    qint64 getFilePos() { return m_pimpl->tell(); }

    /// Set the absolute file position (64-bit)
    void setFilePos(qint64 pos) { m_pimpl->seekTo(pos); }

    // get standard input stream
    static FileInStream &getStdIn();

  }; // class FileInStream

  ///////////////////////////////////////////////////////////

  /** superclass of file output stream */
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

    /** dtor */
    ~FileOutStream() override;
    
    //////////////////////////////////////////////////////

    /** open the file */
    void open(const LString &fname, bool bAppend = false) {
      m_pimpl->o_open(fname, bAppend);
    }

    int write(const char *buf, int off, int len) override {
      return m_pimpl->write(buf, off, len);
    }
    
    void write(int b) override {
      return m_pimpl->write(b);
    }

    void flush() override {
      m_pimpl->flush();
    }

    void close() override {
      m_pimpl->o_close();
    }

    LString getURI() const override {
      return m_pimpl->getDestURI();
    }
    

    /** get implementation */
    impl_type getImpl() const override {
      return m_pimpl;
    }

    //////////////////////////////////////////////////////

    int getFilePos() { return m_pimpl->seek(0,0); }

    void setFilePos(int pos) { m_pimpl->seek(pos,1); }

    /** get standard output stream */
    static FileOutStream &getStdOut();

    /** get standard error stream */
    static FileOutStream &getStdErr();

  };

} // namespace qlib

#endif
