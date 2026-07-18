// -*-Mode: C++;-*-
//
// BRIX (new version of DSN6 format) map file loader
//
// $Id: BrixMapReader.hpp,v 1.3 2005/04/23 17:37:25 ishitani Exp $

#ifndef BRIX_MAP_READER_HPP_INCLUDED_
#define BRIX_MAP_READER_HPP_INCLUDED_

#include "xtal.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>

namespace xtal {

  class DensityMap;

  class XTAL_API BrixMapReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

    // friend class ::BrixMapReader_wrap;
    
  private:
    // target building density map
    DensityMap *m_pMap;
    
    // LString m_buf;
    enum { BUFSIZE=1024 };
    char m_recbuf[BUFSIZE];
    int m_nbuflen;
    // temporary buffer
    char m_tmpbuf[BUFSIZE];
    
    int m_stacol, m_starow, m_stasect;
    int m_endcol, m_endrow, m_endsect;
    int m_ncol, m_nrow, m_nsect;
    int m_na, m_nb, m_nc;
    
    double m_cella, m_cellb, m_cellc;
    double m_alpha, m_beta, m_gamma;
    double m_prod, m_plus, m_sigma;
    
    unsigned char *m_denbuf;
    
    ///////////////////////////////////////////
  public:
    // default constructor
    BrixMapReader();
    
    // destructor
    ~BrixMapReader() override;
    
    ///////////////////////////////////////////
    // overridden methods
    
    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    bool read(qlib::InStream &ins) override;

    /// Content-sniff: report whether `ins` looks like a BRIX map.
    int canHandleContent(qlib::InStream &ins) const override;

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    const char *getName() const override;

    /// get file-type description
    const char *getTypeDescr() const override;

    /// get file extension
    const char *getFileExt() const override;

    /// create default object for this reader
    qsys::ObjectPtr createDefaultObj() const override;

    
    ///////////////////////////////////////////
    
  private:
    
    /// read BRIX header / file type check
    bool readHeader(qlib::InStream &ins);
    
    /// read DNS6 header
    bool readDns6Header(const char *sbuf);

    inline void setmap(int i, int j, int k, unsigned char rho) {
      m_denbuf[i + (j + k*m_nrow)*m_ncol] = rho;
    }
  };
}

#endif
