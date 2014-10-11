// -*-Mode: C++;-*-
//
// Print out formatter class
//
// $Id: PrintStream.hpp,v 1.2 2009/05/04 18:01:21 rishitani Exp $

#ifndef PRINT_STREAM_H__
#define PRINT_STREAM_H__

#include "qlib.hpp"

#include "FormatStream.hpp"

namespace qlib {

  class Vector4D;

  class QLIB_API PrintStream : public FormatOutStream
  {
  public:
    typedef FormatOutStream super_t;
    
  public:
    PrintStream() : super_t() {}

    PrintStream(OutStream &out) : super_t(out) {}

    virtual ~PrintStream();

    //////////////////////////////////////
    // Print-specific methods

    void print(bool b);
    void print(char n);
    void print(int n);
    void print(double n);
    void print(const char *n);
    void print(const LString &n);
    void print(const Vector4D &n);
    void format(const char *fmt, ...);
    void formatln(const char *fmt, ...);

    void repeat(const char *psz, int n) {
      for (; n>0; --n) print(psz);
    }

    void println() {
      write('\n');
    }

    template<class T>
    void println(T n) {
      print(n); println();
    }

    template<class T>
    PrintStream &operator<<(T b) {
      print(b); return *this;
    }

    // void printUTF8(const char *n);
    // void printUTF8(const LString &n);
  };
}

#endif
