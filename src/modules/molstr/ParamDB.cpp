// -*-Mode: C++;-*-
//
// Molecular Parameter Manager
//
// $Id: ParamDB.cpp,v 1.2 2011/03/16 17:24:11 rishitani Exp $

#include <common.h>

#include "ParamDB.hpp"

using namespace molstr;
using namespace molstr::param;

ParamDB::ParamDB()
{
}

ParamDB::~ParamDB()
{
}

#if 0
//////////////////////////////////////////////////////////
// Nonbonded (VdW)

bool ParamDB::addNonbPar(const LString &atom,
			      double eps, double sig,
			      double eps14, double sig14)
{
  NonbDict::iterator iter = m_nonbDict.find(atom);
  if (iter!=m_nonbDict.end())
    m_nonbDict.erase(iter);

  NonbVal val;
  val.eps = eps;
  val.sig = sig;
  val.eps14 = eps14;
  val.sig14 = sig14;

  return (m_nonbDict.insert(NonbDict::value_type(atom, val))).second;
}

bool ParamDB::searchNonbPar(const LString &atom,
				 double &eps, double &sig,
				 double &eps14, double &sig14) const
{
  NonbDict::const_iterator iter = m_nonbDict.find(atom);

  if(iter!=m_nonbDict.end()) {
    // found!!
    NonbVal val = (*iter).second;
    eps = val.eps;
    eps14 = val.eps14;
    sig = val.sig;
    sig14 = val.sig14;
    return true;
  }
  
  return false;
}

//////////////////////////////////////////////////////////
// bond

bool ParamDB::addBondPar(const LString &atomi,
			      const LString &atomj,
			      double kf, double r0)
{
  BondTag tag;
  tag.atomi = atomi;
  tag.atomj = atomj;

  BondDict::iterator iter = m_bondDict.find(tag);
  if (iter!=m_bondDict.end())
    m_bondDict.erase(iter);

  BondVal val;
  val.kf = kf;
  val.r0 = r0;

  return (m_bondDict.insert(BondDict::value_type(tag, val))).second;
}

// search bond param
//  atomi, atomj ... atom type
bool ParamDB::searchBondPar(const LString &atomi,
				 const LString &atomj,
				 double &kf, double &r0) const
{
  BondTag tag;
  tag.atomi = atomi;
  tag.atomj = atomj;

  BondDict::const_iterator iter = m_bondDict.find(tag);

  if(iter!=m_bondDict.end()) {
    // found!!
    BondVal val = (*iter).second;
    kf = val.kf;
    r0 = val.r0;
    return true;
  }
  
  // search reversal case
  tag.atomi = atomj;
  tag.atomj = atomi;

  iter = m_bondDict.find(tag);

  if(iter!=m_bondDict.end()) {
    // found!!
    BondVal val = (*iter).second;
    kf = val.kf;
    r0 = val.r0;
    return true;
  }

  return false;
}

/////////////////////////////////////////
// angle paramaters

// add angle parameter
bool ParamDB::addAnglPar(const LString &atomi,
			      const LString &atomj,
			      const LString &atomk,
			      double kf, double r0)
{
  AnglTag tag;
  tag.atomi = atomi;
  tag.atomj = atomj;
  tag.atomk = atomk;

  AnglDict::iterator iter = m_anglDict.find(tag);
  if (iter!=m_anglDict.end())
    m_anglDict.erase(iter);

  AnglVal val;
  val.kf = kf;
  val.r0 = r0;

  return (m_anglDict.insert(AnglDict::value_type(tag, val))).second;
}

// search angle parameter
bool ParamDB::searchAnglPar(const LString &atomi,
                            const LString &atomj,
                            const LString &atomk,
			    double &kf, double &r0) const
{
  AnglTag tag;
  tag.atomi = atomi;
  tag.atomj = atomj;
  tag.atomk = atomk;

  AnglDict::const_iterator iter = m_anglDict.find(tag);

  if(iter!=m_anglDict.end()) {
    // found!!
    kf = iter->second.kf;
    r0 = iter->second.r0;
    return true;
  }
  
  // search reversal case
  tag.atomk = atomi;
  tag.atomj = atomj;
  tag.atomi = atomk;

  iter = m_anglDict.find(tag);

  if(iter!=m_anglDict.end()) {
    // found!!
    kf = iter->second.kf;
    r0 = iter->second.r0;
    return true;
  }

  return false;
}


/////////////////////////////////////////
// dihedral paramaters

// add dihedral/improper parameter
bool ParamDB::addDihePar(const LString &atomi,
			      const LString &atomj,
			      const LString &atomk,
			      const LString &atoml,
			      double kf, double pe, double del)
{
  DiheTag tag;
  tag.atomi = atomi;
  tag.atomj = atomj;
  tag.atomk = atomk;
  tag.atoml = atoml;
  
  DiheDict::iterator iter = m_diheDict.find(tag);
  if (iter!=m_diheDict.end())
    m_diheDict.erase(iter);

  DiheVal val;
  val.kf = kf;
  val.pe = pe;
  val.del = del;

  return (m_diheDict.insert(DiheDict::value_type(tag, val))).second;
}

bool ParamDB::searchDihePar(const LString &atomi,
				 const LString &atomj,
				 const LString &atomk,
				 const LString &atoml,
				 double &kf, double &pe, double &del) const
{
  LString wcard("x");

  DiheVal val;
  DiheTag tag;

  // search the exact matching
  tag.atomi = atomi;
  tag.atomj = atomj;
  tag.atomk = atomk;
  tag.atoml = atoml;

  if (searchDiheHelper(tag, val)) {
    kf = val.kf;
    pe = val.pe;
    del = val.del;
    return true;
  }

  // search wildcard case (* j k *)
  tag.atomi = wcard;
  tag.atoml = wcard;

  if (searchDiheHelper(tag, val)) {
    kf = val.kf;
    pe = val.pe;
    del = val.del;
    return true;
  }

  // not found
  return false;
}

bool ParamDB::searchImprPar(const LString &atomi,
				 const LString &atomj,
				 const LString &atomk,
				 const LString &atoml,
				 double &kf, double &pe, double &del) const
{
  LString wcard("x");

  DiheVal val;
  DiheTag tag;

  tag.atomi = atomi;
  tag.atomj = atomj;
  tag.atomk = atomk;
  tag.atoml = atoml;

  if (searchDiheHelper(tag, val)) {
    kf = val.kf;
    pe = val.pe;
    del = val.del;
    return true;
  }

  // search wildcard case (i * * l)
  tag.atomj = wcard; 
  tag.atomk = wcard;

  if (searchDiheHelper(tag, val)) {
    kf = val.kf;
    pe = val.pe;
    del = val.del;
    return true;
  }

  // search wildcard case (* j k l)
  tag.atomi = wcard;
  tag.atomj = atomj;
  tag.atomk = atomk;
  tag.atoml = atoml;

  if (searchDiheHelper(tag, val)) {
    kf = val.kf;
    pe = val.pe;
    del = val.del;
    return true;
  }

  // search wildcard case (* j k *)
  tag.atomi = wcard;
  tag.atomj = atomj;
  tag.atomk = atomk;
  tag.atoml = wcard;

  if (searchDiheHelper(tag, val)) {
    kf = val.kf;
    pe = val.pe;
    del = val.del;
    return true;
  }

  // search wildcard case (* * k l)
  tag.atomi = wcard;
  tag.atomj = wcard;
  tag.atomk = atomk;
  tag.atoml = atoml;

  if (searchDiheHelper(tag, val)) {
    kf = val.kf;
    pe = val.pe;
    del = val.del;
    return true;
  }

  // not found
  return false;
}

bool ParamDB::searchDiheHelper(DiheTag &tag, DiheVal &val) const
{
  DiheDict::const_iterator iter;

  iter = m_diheDict.find(tag);
  if(iter!=m_diheDict.end()) {
    val = iter->second;
    return true;
  }

  // search reversal case
  DiheTag rtag;
  rtag.atomi = tag.atoml;
  rtag.atomj = tag.atomk;
  rtag.atomk = tag.atomj;
  rtag.atoml = tag.atomi;

  iter = m_diheDict.find(rtag);
  if(iter!=m_diheDict.end()) {
    val = iter->second;
    return true;
  }

  return false;
}

void ParamDB::dump() const
{
  {
    BondDict::const_iterator iter = m_bondDict.begin();
    for ( ; iter!=m_bondDict.end(); iter++) {
      BondTag btag = (*iter).first;
      BondVal bval = (*iter).second;

      LString tagi(btag.atomi);
      LString tagj(btag.atomj);
      MB_DPRINT("bondpar %s-%s; kf = %f, r0 = %f\n",
		tagi.c_str(), tagj.c_str(),
		bval.kf, bval.r0);
    }
  }

  {
    AnglDict::const_iterator iter = m_anglDict.begin();
    for ( ; iter!=m_anglDict.end(); iter++) {
      AnglTag btag = (*iter).first;
      AnglVal bval = (*iter).second;

      LString tagi(btag.atomi);
      LString tagj(btag.atomj);
      LString tagk(btag.atomk);
      MB_DPRINT("anglpar %s-%s-%s; kf = %f, r0 = %f\n",
		tagi.c_str(), tagj.c_str(),
		tagk.c_str(),
		bval.kf, bval.r0);
    }
  }

  {
    DiheDict::const_iterator iter = m_diheDict.begin();
    for ( ; iter!=m_diheDict.end(); iter++) {
      DiheTag btag = (*iter).first;
      DiheVal bval = (*iter).second;

      LString tagi(btag.atomi);
      LString tagj(btag.atomj);
      LString tagk(btag.atomk);
      LString tagl(btag.atoml);
      MB_DPRINT("dihe/impr par %s-%s-%s-%s; kf = %f, pe = %f, del = %f\n",
		tagi.c_str(), tagj.c_str(),
		tagk.c_str(), tagj.c_str(),
		bval.kf, bval.pe, bval.del);
    }
  }
}

#endif

