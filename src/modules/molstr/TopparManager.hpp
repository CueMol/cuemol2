// -*-Mode: C++;-*-
//
// Molecular parameter/topology  module
//
// $Id: TopparManager.hpp,v 1.5 2011/04/03 11:11:06 rishitani Exp $

#ifndef TOPPAR_MODULE_H__
#define TOPPAR_MODULE_H__

#include "molstr.hpp"

#include <qlib/LString.hpp>
#include <qlib/SingletonBase.hpp>

namespace molstr {
  using qlib::LString;

  class ParamDB;
  class TopoDB;
  class ResiToppar;

  class TopparManager;

  class MOLSTR_API TopparManager : public qlib::SingletonBase<TopparManager>
  {
  private:
    /** dictionary of the current force field parameters */
    ParamDB *m_pParamDB;

    /** dictionary of the topology of the residues */
    TopoDB *m_pTopoDB;

  public:
    TopparManager();
    virtual ~TopparManager();

    /////////////////////////////////////
  
    /** module initialization */
    bool load();

    bool readPrmTop(const char *fname, const char *filetype);

    ResiToppar *getResiToppar(const LString &resnam);
    ResiToppar *createResiToppar(const LString &resnam);

    //bool searchNonbPar(const LString &atom,
    //double &eps, double &sig,
    //double &eps14, double &sig14) const;

    ParamDB *getParamDB() { return m_pParamDB; }
    TopoDB *getTopoDB() { return m_pTopoDB; }

    double getVdwRadius(MolAtomPtr pAtom, bool bExplH);
    bool getCharge(MolAtomPtr pAtom, bool bExplH, const LString &ns, double &rval);

  public:

    //////////
    // Initializer/finalizer

    static bool init()
    {
      return qlib::SingletonBase<TopparManager>::init();
    }
    
    static void fini()
    {
      qlib::SingletonBase<TopparManager>::fini();
    }

    //////////
    // Utilities

    static bool isAminoAcid(const LString &rname);
    static bool isNuclAcid(const LString &rname);

  };
}

SINGLETON_BASE_DECL(molstr::TopparManager);

#endif
