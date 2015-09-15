// -*-Mode: C++;-*-
//
// ChainIterator : residue iterator class
//
// $Id: ChainIterator.hpp,v 1.3 2009/02/25 12:27:43 rishitani Exp $

#ifndef CHAIN_ITERATOR_HPP_INCLUDED
#define CHAIN_ITERATOR_HPP_INCLUDED

#include "molstr.hpp"
#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "Selection.hpp"

namespace molstr {

  class MOLSTR_API ChainIterator : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    /////////////
    // Properties

  private:
    /// target mol object
    MolCoordPtr m_pTarg;
  public:
    void setTarget(MolCoordPtr pmol);
    MolCoordPtr getTarget() const;


  private:
    /// target selection
    SelectionPtr m_pSel;
  public:
    void setSelection(SelectionPtr pmol);
    SelectionPtr getSelection() const;


    ///////////
    // Workarea

  private:
    MolCoord::ChainIter m_citer;

  public:

    /// construct iterator pointing to nothing
    ChainIterator()
    {
    }

    /// construct iterator for the all part of the mol pmol
    ChainIterator(MolCoordPtr pmol)
      : m_pTarg(pmol)
    {
    }

    /// construct iterator for part of pmol selected by psel
    ChainIterator(MolCoordPtr pmol, SelectionPtr psel)
      : m_pTarg(pmol), m_pSel(psel)
    {
    }
  
    ~ChainIterator()
    {
    }

    void first();
    void next();
    bool hasMore();
    MolChainPtr get();
  
  };

}

#endif // RESIDUE_ITERATOR_H__
