// -*-Mode: C++;-*-
//
// file input stream implementation for POSIX (without bufferring)
//
// $Id: PosixFileStream.cpp,v 1.4 2011/04/01 13:43:22 rishitani Exp $

#include <common.h>
#include <typeinfo>

#include "FileStream.hpp"

#include "LUnicode.hpp"
#include "LExceptions.hpp"

using namespace qlib;

///
///  File I/O implementation using C's stdio functions
///
class PosixFIOImpl : public qlib::detail::AbstFIOImpl
{
private:
  
  /// file descriptor
  FILE *m_fp;
  
  LString m_origFname;

public:
  /// default ctor
  PosixFIOImpl() : m_fp(NULL)
  {
    // MB_DPRINTLN("PosixFIOImpl(%p) ctor called", this);
  }

  /// dtor
  ~PosixFIOImpl() override
  {
    // MB_DPRINTLN("PosixFIOImpl(%p) dtor called", this);
    if (m_fp!=NULL)
      ::fclose(m_fp);
  }

  ////////////////////////////////////////////////////////////////

  LString getPathName() const override
  {
    return m_origFname;
  }

  void i_open(const LString &fname) override
  {
    MB_ASSERT(m_fp==NULL);
#ifdef _WIN32
    m_fp = qlib::fopen_utf8(fname.c_str(), "rb");
#else
    m_fp = qlib::fopen_utf8(fname.c_str(), "r");
#endif
    if (m_fp==NULL) {
      auto msg = LString::format("Cannot open file: %s", fname.c_str());
      MB_DPRINTLN("%s", msg.c_str());
      MB_THROW(IOException, msg);
    }

    //setvbuf(m_fp, NULL, _IOFBF, 256*1024*1024);

    setFileInfo(fname);
  }

  bool ready() override {
    MB_ASSERT(m_fp!=NULL);
    int neof = feof(m_fp);
    if (neof!=0) return false;

    int n = getc(m_fp);
    neof = feof(m_fp);
    if (neof!=0) return false;
    ungetc(n, m_fp);
    return true;
  }

  int read() override {
    MB_ASSERT(m_fp!=NULL);
    int ch = ::fgetc(m_fp);
    if (ch==EOF) {
      //MB_THROW(EOFException, "Posix file stream: EOF reached");
      return -1;
    }
    else
      return ch;
  }

  int read(char *buf, int off, int len) override {
    MB_ASSERT(m_fp!=NULL);
    size_t res = ::fread(&buf[off], sizeof(char), len, m_fp);
    if (res==0 && feof(m_fp)) {
      return -1;
      //MB_THROW(EOFException, "Reached to EOF.");
    }

    //if (res==0 && ferror(m_fp))
    //MB_THROW(IOException, "fread error.");

    //MB_DPRINTLN("fpos: %d", ::ftell(m_fp));
    return res;
  }

  ///
  ///  Try to skip n bytes.
  ///  @return the actual number of bytes skipped
  ///
  int skip(int n) override {
    MB_ASSERT(m_fp!=NULL);
    int res = ::fseek(m_fp, n, SEEK_CUR);
    if (res<0)
      MB_THROW(IOException, "Cannot seek file ptr");
    // MB_DPRINTLN("fpos: %d", ::ftell(m_fp));
    return n;
  }

  void i_close() override {
    if (m_fp==NULL) return;
    ::fclose(m_fp);
    m_fp = NULL;
  }

  ////////////////////////////////////////////////////////////////

  void o_open(const LString &fname, bool bAppend) override {
    MB_ASSERT(m_fp==NULL);
#ifdef _WIN32
    if (bAppend)
      m_fp = qlib::fopen_utf8(fname.c_str(), "ab");
    else
      m_fp = qlib::fopen_utf8(fname.c_str(), "wb");
#else
    if (bAppend)
      m_fp = qlib::fopen_utf8(fname.c_str(), "a");
    else
      m_fp = qlib::fopen_utf8(fname.c_str(), "w");
#endif
    if (m_fp==NULL) {
      auto msg = LString::format("Cannot open file: %s", fname.c_str());
      MB_DPRINTLN("%s", msg.c_str());
      MB_THROW(IOException, msg);
    }

    //setvbuf(m_fp, NULL, _IOFBF, 256*1024*1024);

    setFileInfo(fname);
  }
  
  int write(const char *buf, int off, int len) override {
    MB_ASSERT(m_fp!=NULL);
    size_t res = ::fwrite(&buf[off], sizeof(char), len, m_fp);
    return res;
  }
    
  void write(int b) override {
    MB_ASSERT(m_fp!=NULL);
    ::fputc(b, m_fp);
  }

  void flush() override {
    MB_ASSERT(m_fp!=NULL);
    ::fflush(m_fp);
  }

  void o_close() override {
    if (m_fp==NULL) return;
     ::fclose(m_fp);
    m_fp = NULL;
  }

  ///////////////////////
  // 64-bit random access (InImpl seekable interface)

  bool isSeekable() const override {
    if (m_fp==NULL) return false;
    // pipes / terminals report an error here; regular files succeed
    return tell()>=0;
  }

  qint64 tell() const override {
    if (m_fp==NULL) return -1;
#ifdef _WIN32
    const __int64 res = ::_ftelli64(m_fp);
#else
    const off_t res = ::ftello(m_fp);
#endif
    return (res<0) ? -1 : (qint64) res;
  }

  bool seekTo(qint64 pos) override {
    if (m_fp==NULL || pos<0) return false;
#ifdef _WIN32
    return ::_fseeki64(m_fp, (__int64) pos, SEEK_SET)==0;
#else
    return ::fseeko(m_fp, (off_t) pos, SEEK_SET)==0;
#endif
  }

  int seek(int pos, int mode) override {
    switch (mode) {
    default:
    case 0: {
      // get fpos
      MB_ASSERT(m_fp!=NULL);
      int res = ::ftell(m_fp);
      if (res<0)
	MB_THROW(IOException, "Cannot seek file ptr");
      return res;
    }

    case 1: {
      // set fpos (abs)
      MB_ASSERT(m_fp!=NULL);
      int res = ::fseek(m_fp, pos, SEEK_SET);
      if (res<0)
	MB_THROW(IOException, "Cannot seek file ptr");
      return pos;
    }

    case 2: {
      // set fpos (rel)
      return skip(pos);
    }
    }
  }

  LString getSrcURI() const override {
    return m_origFname;
  }
  
  LString getDestURI() const override {
    return m_origFname;
  }

  ////////////////////////////////////////////////////////////////
  // specific implementation

  void assign(FILE *fp)
  {
    MB_ASSERT(m_fp==NULL);
    m_fp = fp;
  }

  void setFileInfo(const LString &rel)
  {
    m_origFname = rel;
  }
};


FileInStream::FileInStream()
  : m_pimpl(MB_NEW PosixFIOImpl())
{
  //setImpl(m_pimpl);
  //  MB_DPRINTLN("FileInStream(%p) ctor called", this);
}

/** copy ctor */
FileInStream::FileInStream(const FileInStream &r) : m_pimpl(r.m_pimpl)
{
//  setImpl(m_pimpl);
}

FileInStream::~FileInStream()
{
  //  MB_DPRINTLN("FileInStream(%p) dtor called", this);
}

FileOutStream::FileOutStream()
  : m_pimpl(MB_NEW PosixFIOImpl())
{
//  setImpl(m_pimpl);
}

/** copy ctor */
FileOutStream::FileOutStream(const FileOutStream &r)
  : m_pimpl(r.m_pimpl)
{
//  setImpl(m_pimpl);
}

FileOutStream::~FileOutStream()
{
  //  MB_DPRINTLN("FileOutStream(%p) dtor called", this);
}

static FileInStream *m_pStdIn = NULL;
static FileOutStream *m_pStdOut = NULL;
static FileOutStream *m_pStdErr = NULL;

//static
FileInStream &FileInStream::getStdIn()
{
  if (m_pStdIn!=NULL) return *m_pStdIn;

  m_pStdIn = MB_NEW FileInStream();
#ifndef WIN32
  PosixFIOImpl &impl = dynamic_cast<PosixFIOImpl &>(*m_pStdIn->getImpl());
  impl.assign(stdin);
#endif

  return *m_pStdIn;
}

//static
FileOutStream &FileOutStream::getStdOut()
{
  if (m_pStdOut!=NULL) return *m_pStdOut;

  m_pStdOut = MB_NEW FileOutStream();
#ifndef WIN32
  PosixFIOImpl &impl = dynamic_cast<PosixFIOImpl &>(*m_pStdOut->getImpl());
  impl.assign(stdout);
#endif

  return *m_pStdOut;
}

//static
FileOutStream &FileOutStream::getStdErr()
{
  if (m_pStdErr!=NULL) return *m_pStdErr;

  m_pStdErr = MB_NEW FileOutStream();
#ifndef WIN32
  PosixFIOImpl &impl = dynamic_cast<PosixFIOImpl &>(*m_pStdErr->getImpl());
  impl.assign(stderr);
#endif

  return *m_pStdErr;
}

