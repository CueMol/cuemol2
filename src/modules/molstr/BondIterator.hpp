// -*-Mode: C++;-*-
//
// BondIterator : bond iterator class
//
// $Id: BondIterator.hpp,v 1.3 2011/03/29 11:03:44 rishitani Exp $

#ifndef BOND_ITERATOR_H__
#define BOND_ITERATOR_H__

#include "molstr.hpp"
#include "MolCoord.hpp"

namespace molstr {

  class MolCoord;
  class MolBond;
  class Selection;

/*
class BondIteratorCb
{
public:
  virtual void bondIterCalled(MolBond *pbond) =0;
};
*/

  class MOLSTR_API BondIterator
  {
  private:
    MolCoordPtr m_pTarg;

    SelectionPtr m_pSel;

    MolCoord::BondIter m_biter;

    /** workspace for the cache generation */
    // std::list<std::pair<int, int> > m_cacheList;
    // int m_nSizeCached, m_nCacheIdx;
    // const int *m_pDataCached;

    std::set<int> m_aidset;

  public:
    BondIterator()
    {
    }

    BondIterator(MolCoordPtr pmol)
         : m_pTarg(pmol)
    {
    }

    BondIterator(MolCoordPtr pmol, SelectionPtr psel)
         : m_pTarg(pmol), m_pSel(psel)
    {
    }

    virtual ~BondIterator();

    // cursor type interface
    void first();
    void next();
    bool hasMore();
    bool get(MolAtomPtr &pa1, MolAtomPtr &pa2);
    void getID(int &aid1, int &aid2);

    MolBond *getBond()
    {
      return m_biter->second;
    }

  private:
    //////////////////////////////////

    void setupAidSet();
    // void checkAndCreateCache();

    /*
      //////////////////////////////////
      // specific implementations
      void molAtomSel_first(AtomSel *psel);
      void molAtomSel_next(AtomSel *psel);
      bool molAtomSel_hasMore(AtomSel *psel);
      MolBond *molAtomSel_get(AtomSel *psel);
     */
  };

}

#endif // BOND_ITERATOR_H__
