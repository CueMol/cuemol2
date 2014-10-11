// -*-Mode: C++;-*-
//
//  CNS format top/par file reader class
//
//  $Id: CnsParFile.hpp,v 1.3 2011/01/27 15:08:33 rishitani Exp $

#ifndef CNS_PAR_FILE_H__
#define CNS_PAR_FILE_H__

#include "molstr.hpp"

#include <qlib/LString.hpp>

namespace molstr {

  using qlib::LString;

  class ParamDB;
  class TopoDB;
  class ResiToppar;
  class ResiPatch;

  class CnsParFile
  {
  private:
    // token buffer
    LString m_recbuf;

    // token buffer (converted to upper case)
    LString m_recupper;

    // building parameter dictionaly
    ParamDB *m_pParamDB;

    // building residue topology/param dictionaly
    TopoDB *m_pTopoDB;

    // input stream
    FILE *m_fp;


    // current processing residue
    ResiToppar *m_pCurResid;

    // temporary object classes
    //   for ATOM/BOND/ANGL/DIHE/IMPR
    struct Atom {
      LString name;
      LString type;
      double sig, eps, sig14, eps14;
    };

    struct Bond {
      LString a1name;
      LString a2name;
      double kf, r0;
    };

    struct Angl {
      LString a1name;
      LString a2name;
      LString a3name;
      double kf, th0;
    };

    struct Dihe {
      LString a1name;
      LString a2name;
      LString a3name;
      LString a4name;
      double kf, pe, del;
    };

  public:
    CnsParFile();
    virtual ~CnsParFile();

    // attach ParamDB obj to this I/O obj
    void attach(ParamDB *ppardic,
		TopoDB *ptpdic);

    // detach ParamDB obj from this I/O obj
    void detach();

    //

    // read CNS format parameter file from "filename"
    bool read(const char *filename);

    // read CNS format parameter from stream fp
    bool read(FILE *fp);

  private:
    bool readRecord();

    bool readToEOL();
    bool readToEOC();
    bool skipToEndToken();

    bool chkRec(const char *token)
    {
      return m_recupper.startsWith(token);
    }

    // param file processing
    bool procBondStat();
    bool procAnglStat();
    bool procDiheImprStat();
    bool procNonbStat();

    // top file processing
    bool procMassStat();
    bool procResiStat();
    bool procPresStat();

    bool procTopAtom(Atom &atm);
    bool procTopBond(Bond &bnd);
    bool procTopAngl(Angl &ang);
    bool procTopDiheImpr(Dihe &dhe, bool fdihe);

    // linkage file processing
    bool procLinkStat();

    // Que's original extensions
    bool procPropResiStat();
    bool procRingStat();

    /// Process MainCh/SideCh statement
    bool procSMChStat(bool bSide);
  };

}

#endif // CNS_PAR_FILE_H__
