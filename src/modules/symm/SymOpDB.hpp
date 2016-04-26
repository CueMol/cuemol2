// -*-Mode: C++;-*-
//
// Symmetry operator database class
//
// $Id: SymOpDB.hpp,v 1.1 2010/09/05 09:05:16 rishitani Exp $

#ifndef SYMM_SYMOP_DB_HPP_INCLUDED
#define SYMM_SYMOP_DB_HPP_INCLUDED

#include "symm.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/Matrix4D.hpp>

namespace symm {

using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::LString;

class SYMM_API SymOpDB : public qlib::LSingletonScrObject,
			 public qlib::SingletonBase<SymOpDB>
{
  MC_SCRIPTABLE;

public:
  /// symmetry operator
  struct Operator {
    LString name;
    Matrix4D mat;
  };

  /// space group
  struct Group
  {
    int id;
    int nasym;
    int sysid;
    LString cname;
    LString name;
    Operator *pOps;

    Group(int n) : nasym(n), sysid(0)
    {
      pOps = new Operator[nasym];
    }

    ~Group() {
      if (pOps!=NULL)
        delete [] pOps;
    }
  };

  typedef std::map<int, SymOpDB::Group *> SgTab;
  typedef SgTab::const_iterator iterator;

private:
  LString m_fname;
  
  SgTab *m_psgtab;
  
public:
  SymOpDB();
  virtual ~SymOpDB();

  //////////////////////////////////////////////////////////

  /// Set symmetry library file name
  //  contents will be loaded on demand later
  void setSymLibFile(const LString &fname) {
    m_fname = fname;
    cleartabs();
  }

  void appendSg(Group *psg);

  //////////////////////////////////////////////////////////

  /// get the number of asymmetric units
  int getAsymNum(int nsg) const;

  /// Get the full Hermann-Mauguin
  /// symbol (e.g. P 43 21 2) of nsg.
  const char *getCName(int nsg) const;

  /// Get the abbreviated Hermann-Mauguin
  /// symbol (e.g. P43212) of nsg.
  const char *getName(int nsg) const;

  int getXtalSysID(int nsg) const;

  ///
  /// Get all symmetry operators by the space group nsg
  ///
  int getSymOps(int nsg, Matrix4D *&pvec, LString *&popnames) const;

  /// Find space group no by canonical name (HM name)
  int getSgIDByCName(const LString &name) const;

  /// Find space group no by name
  int getSgIDByName(const LString &name) const;

  iterator begin() const { return m_psgtab->begin(); }
  iterator end() const { return m_psgtab->end(); }

  /// Get space group names belonging to the specified lattice
  LString getSgNamesJSON(const LString &lat);

  /// Load operator file from system data directory
  void load();

  /// change crystal info (wrapper)
  void changeXtalInfo(qlib::uid_t nObjID,
                      double a, double b, double c,
                      double alp, double bet, double gam, int nsg);

  bool changeXIImpl(qlib::uid_t nObjID, CrystalInfo *pXI);

public:

  static bool init()
  {
    return qlib::SingletonBase<SymOpDB>::init();
  }
    
  static void fini()
  {
    qlib::SingletonBase<SymOpDB>::fini();
  }

private:
  void cleartabs();
  Group *getSpaceGroup(int nsg) const;

  /** load symlib.dat file */
  void loadSymLibFile();

  void checkAndLoad() const {
    if (m_psgtab->size()==0) {
      SymOpDB *pthis = const_cast<SymOpDB *>(this);
      pthis->loadSymLibFile();
    }
  }

};

} // namespace symm

#endif


