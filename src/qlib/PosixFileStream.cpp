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
  virtual ~PosixFIOImpl()
  {
    // MB_DPRINTLN("PosixFIOImpl(%p) dtor called", this);
    if (m_fp!=NULL)
      ::fclose(m_fp);
  }

  ////////////////////////////////////////////////////////////////

  virtual LString getPathName() const
  {
    return m_origFname;
  }

  virtual void i_open(const LString &fname)
  {
    MB_ASSERT(m_fp==NULL);
#ifdef _WIN32
    m_fp = qlib::fopen_utf8(fname.c_str(), "rb");
#else
    m_fp = qlib::fopen_utf8(fname.c_str(), "r");
#endif
    if (m_fp==NULL) {
      MB_THROW(IOException, ("Cannot open file:"+fname));
    }

    //setvbuf(m_fp, NULL, _IOFBF, 256*1024*1024);

    setFileInfo(fname);
  }

  virtual bool ready() {
    MB_ASSERT(m_fp!=NULL);
    int neof = feof(m_fp);
    if (neof!=0) return false;

    int n = getc(m_fp);
    neof = feof(m_fp);
    if (neof!=0) return false;
    ungetc(n, m_fp);
    return true;
  }

  virtual int read() {
    MB_ASSERT(m_fp!=NULL);
    int ch = ::fgetc(m_fp);
    if (ch==EOF) {
      //MB_THROW(EOFException, "Posix file stream: EOF reached");
      return -1;
    }
    else
      return ch;
  }

  virtual int read(char *buf, int off, int len) {
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
  virtual int skip(int n) {
    MB_ASSERT(m_fp!=NULL);
    int res = ::fseek(m_fp, n, SEEK_CUR);
    if (res<0)
      MB_THROW(IOException, "Cannot seek file ptr");
    // MB_DPRINTLN("fpos: %d", ::ftell(m_fp));
    return n;
  }

  virtual void i_close() {
    if (m_fp==NULL) return;
    ::fclose(m_fp);
    m_fp = NULL;
  }

  ////////////////////////////////////////////////////////////////

  virtual void o_open(const LString &fname, bool bAppend) {
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
      MB_THROW(IOException, ("Cannot open file:"+fname));
    }

    //setvbuf(m_fp, NULL, _IOFBF, 256*1024*1024);
    //LOG_DPRINTLN("PosixFileStream> o_open(%s)=%p", fname.c_str(), m_fp);

    setFileInfo(fname);
  }
  
  virtual int write(const char *buf, int off, int len) {
    MB_ASSERT(m_fp!=NULL);
    size_t res = ::fwrite(&buf[off], sizeof(char), len, m_fp);
    return res;
  }
    
  virtual void write(int b) {
    MB_ASSERT(m_fp!=NULL);
    ::fputc(b, m_fp);
  }

  virtual void flush() {
    MB_ASSERT(m_fp!=NULL);
    ::fflush(m_fp);
  }

  virtual void o_close() {
    if (m_fp==NULL) return;
     ::fclose(m_fp);
    m_fp = NULL;
  }

  virtual qint64 seek(qint64 pos, int mode)
  {
    switch (mode) {
    default:
    case 0: {
      // get fpos
      MB_ASSERT(m_fp!=NULL);
#ifdef WIN32
      qint64 res = _ftelli64(m_fp);
#elif defined(HAVE_FTELLO)
      qint64 res = ftello(m_fp);
#else
      qint64 res = ftell(m_fp);
#endif
      if (res<0)
        MB_THROW(IOException, "Cannot seek file ptr");
      return res;
    }

    case 1: {
      // set fpos (abs)
      MB_ASSERT(m_fp!=NULL);
#ifdef WIN32
      int res = _fseeki64(m_fp, pos, SEEK_SET);
#elif defined(HAVE_FSEEKO)
      int res = fseeko(m_fp, pos, SEEK_SET);
#else
      int res = fseek(m_fp, pos, SEEK_SET);
#endif
      if (res<0)
	MB_THROW(IOException, "Cannot seek file ptr");
      return pos;
    }

    case 2: {
      // set fpos (rel)
      MB_ASSERT(m_fp!=NULL);
#ifdef WIN32
      int res = _fseeki64(m_fp, pos, SEEK_CUR);
#elif defined(HAVE_FSEEKO)
      int res = fseeko(m_fp, pos, SEEK_CUR);
#else
      int res = fseek(m_fp, pos, SEEK_CUR);
#endif
      if (res<0)
	MB_THROW(IOException, "Cannot seek file ptr");
      return pos;
    }
    }
  }

  virtual LString getSrcURI() const {
    return m_origFname;
  }
  
  virtual LString getDestURI() const {
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

/////////////////////////////////////////////////////////

FileInStream::FileInStream()
  : m_pimpl(MB_NEW PosixFIOImpl())
{
  //  MB_DPRINTLN("FileInStream(%p) ctor called", this);
}

FileInStream::FileInStream(const FileInStream &r) : m_pimpl(r.m_pimpl)
{
}

FileInStream::~FileInStream()
{
  //  MB_DPRINTLN("FileInStream(%p) dtor called", this);
}

void FileInStream::open(const LString &fname)
{
  m_pimpl->i_open(fname);
}

bool FileInStream::ready() {
  return m_pimpl->ready();
}

int FileInStream::read() {
  return m_pimpl->read();
}

int FileInStream::read(char *buf, int off, int len) {
  return m_pimpl->read(buf, off, len);
}

int FileInStream::skip(int len) {
  return m_pimpl->skip(len);
}

void FileInStream::close() {
  m_pimpl->i_close();
}

LString FileInStream::getURI() const {
  return m_pimpl->getSrcURI();
}

InStream::impl_type FileInStream::getImpl() const
{
  return m_pimpl;
}

bool FileInStream::isSeekable() const
{
  return true;
}

qint64 FileInStream::getFilePos() const
{
  return m_pimpl->seek(qint64(0),0);
}

void FileInStream::setFilePos(qint64 pos)
{
  m_pimpl->seek(pos,1);
}

static FileInStream *m_pStdIn = NULL;

//static
FileInStream &FileInStream::getStdIn()
{
  if (m_pStdIn!=NULL) return *m_pStdIn;

  m_pStdIn = MB_NEW FileInStream();
#ifndef WIN32
  PosixFIOImpl &impl = dynamic_cast<PosixFIOImpl &>(*m_pStdIn->getImpl());
  impl.assign(::stdin);
#endif

  return *m_pStdIn;
}

/////////////////////////////////////////////////////////

FileOutStream::FileOutStream()
  : m_pimpl(MB_NEW PosixFIOImpl())
{
}

/** copy ctor */
FileOutStream::FileOutStream(const FileOutStream &r)
  : m_pimpl(r.m_pimpl)
{
}

FileOutStream::~FileOutStream()
{
  //  MB_DPRINTLN("FileOutStream(%p) dtor called", this);
}

int FileOutStream::write(const char *buf, int off, int len)
{
  return m_pimpl->write(buf, off, len);
}

void FileOutStream::write(int b)
{
  return m_pimpl->write(b);
}

void FileOutStream::flush()
{
  m_pimpl->flush();
}

void FileOutStream::close()
{
  m_pimpl->o_close();
}

LString FileOutStream::getURI() const
{
  return m_pimpl->getDestURI();
}
    
OutStream::impl_type FileOutStream::getImpl() const
{
  return m_pimpl;
}

qint64 FileOutStream::getFilePos()
{
  return m_pimpl->seek(0,0);
}
    
void FileOutStream::setFilePos(qint64 pos)
{
  m_pimpl->seek(pos,1);
}

static FileOutStream *m_pStdOut = NULL;
static FileOutStream *m_pStdErr = NULL;

//static
FileOutStream &FileOutStream::getStdOut()
{
  if (m_pStdOut!=NULL) return *m_pStdOut;

  m_pStdOut = MB_NEW FileOutStream();
#ifndef WIN32
  PosixFIOImpl &impl = dynamic_cast<PosixFIOImpl &>(*m_pStdOut->getImpl());
  impl.assign(::stdout);
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
  impl.assign(::stdout);
#endif

  return *m_pStdErr;
}

