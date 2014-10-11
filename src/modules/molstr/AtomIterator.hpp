// -*-Mode: C++;-*-
//
// AtomIterator : atom iterator class
//
// $Id: AtomIterator.hpp,v 1.2 2009/01/08 10:27:25 rishitani Exp $

#ifndef ATOM_ITERATOR_HPP_
#define ATOM_ITERATOR_HPP_

#include "molstr.hpp"

#include "MolCoord.hpp"

namespace molstr {
  
  class MolCoord;
  class MolAtom;
  class MolResidue;
  class Selection;
  
  class MOLSTR_API AtomIterator : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    /** target mol object */
    MolCoordPtr m_pTarg;

    /** target selection */
    SelectionPtr m_pSel;

    //////////
    // generic MolSelection workarea

    MolCoord::AtomIter m_aiter;

    //////////
    // MolCachedSel workarea

    /** AID set of evaluated selection */
    const std::set<int> *m_pAtomSet;

    std::set<int>::const_iterator m_acache_iter;

    //////////

  public:
    AtomIterator()
      : m_pAtomSet(NULL)
    {
    }

    AtomIterator(MolCoordPtr pmol)
      : m_pTarg(pmol),
	m_pAtomSet(NULL)
    {
    }
  
    AtomIterator(MolCoordPtr pmol, SelectionPtr psel)
      : m_pTarg(pmol), m_pSel(psel),
	m_pAtomSet(NULL)
    {
    }
  
    ~AtomIterator() {}

    void setTarget(MolCoordPtr pmol);
    MolCoordPtr getTarget() const;

    void setSelection(SelectionPtr pmol);
    SelectionPtr getSelection() const;

    /** cursor type interface */
    void first();
    void next();
    bool hasMore();
    MolAtomPtr get();
    int getID();

  private:

    /** check and create new cache data */
    bool checkAndCreateCache();

    // specific implementations
    /*
    void molAtomSel_first(AtomSel *psel);
    void molAtomSel_next(AtomSel *psel);
    bool molAtomSel_hasMore(AtomSel *psel);
    MolAtom *molAtomSel_get(AtomSel *psel);
    int molAtomSel_getID(AtomSel *psel);
    */
  
  };

}

#endif // ATOM_ITERATOR_H__
