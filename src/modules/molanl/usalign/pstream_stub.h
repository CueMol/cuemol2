// CueMol stub for pstream.h (redi::ipstream).
//
// Upstream US-align reads gzip/bz2 files through a POSIX process stream.
// CueMol passes coordinates in memory and never calls the file readers, so
// this stub only keeps them compilable: opening always fails.

#ifndef USALIGN_PSTREAM_STUB_H
#define USALIGN_PSTREAM_STUB_H

#include <fstream>
#include <string>

namespace redi {
  class ipstream : public std::ifstream
  {
  public:
    void open(const std::string &)
    {
      setstate(std::ios_base::failbit);
    }
  };
}

#endif
