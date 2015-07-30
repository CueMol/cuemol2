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
    virtual ~BrixMapReader();
    
    ///////////////////////////////////////////
    // overridden methods
    
    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

    //////////////////////////////////////////////
    // Information query methods
    
    /// get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;
    
    /// get file-type description
    virtual const char *getTypeDescr() const;
    
    /// get file extension
    virtual const char *getFileExt() const;
    
    /// create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

    
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
