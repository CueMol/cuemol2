// -*-Mode: C++;-*-
//
//  Evaluator interface
//

#ifndef MOLSTR_EVALUATOR_HPP_INCLUDED
#define MOLSTR_EVALUATOR_HPP_INCLUDED

#include "molstr.hpp"

//#include <qlib/LScrObjects.hpp>
//#include <qlib/LScrSmartPtr.hpp>
//#include <qlib/mcutils.hpp>

#include "MolAtom.hpp"
#include "MolResidue.hpp"

namespace molstr {

class MOLSTR_API RealNumEvaluator
{
  // MC_SCRIPTABLE;

public:
  virtual ~RealNumEvaluator();

  virtual bool getAtomValue(MolAtom *pAtom, double &value) =0;

  virtual bool getResidValue(MolResidue *pResid, double &value) =0;

};

class MOLSTR_API IntNumEvaluator
{
  // MC_SCRIPTABLE;

public:
  virtual ~IntNumEvaluator();

  virtual bool getAtomValue(MolAtom *pAtom, int &value) =0;

  virtual bool getResidValue(MolResidue *pResid, int &value) =0;

};

}

#endif

