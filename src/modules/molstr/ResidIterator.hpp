// -*-Mode: C++;-*-
//
// Residterator : residue iterator class
//
// $Id: ResidIterator.hpp,v 1.3 2009/02/25 12:27:43 rishitani Exp $

#ifndef RESIDUE_ITERATOR_H__
#define RESIDUE_ITERATOR_H__

#include "molstr.hpp"
#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "Selection.hpp"

namespace molstr {

  /*class ResidIteratorCb
    {
    public:
    virtual void residIterCalled(MolResiduePtr pres) =0;
    };*/

  class MOLSTR_API ResidIterator : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    /** target mol object */
    MolCoordPtr m_pTarg;

    /** target selection */
    SelectionPtr m_pSel;

    MolCoord::ChainIter m_citer;
    MolChain::ResidCursor m_riter; 

  public:

    /** construct iterator pointing to nothing */
    ResidIterator()
    {
    }

    /** construct iterator for the all part of the mol pmol */
    ResidIterator(MolCoordPtr pmol)
      : m_pTarg(pmol)
    {
    }

    /** construct iterator for part of pmol selected by psel */
    ResidIterator(MolCoordPtr pmol, SelectionPtr psel)
      : m_pTarg(pmol), m_pSel(psel)
    {
    }
  
    ~ResidIterator()
    {
    }

    void setTarget(MolCoordPtr pmol);
    MolCoordPtr getTarget() const;

    void setSelection(SelectionPtr pmol);
    SelectionPtr getSelection() const;

    //    // callback type interface
    //    void iterate(ResidIteratorCb *pcback);

    // cursor type interface
    void first();
    void next();
    bool hasMore();
    MolResiduePtr get();
  
  private:
    bool checkAllAtoms(MolResiduePtr pRes);
  

  };

}

#endif // RESIDUE_ITERATOR_H__
