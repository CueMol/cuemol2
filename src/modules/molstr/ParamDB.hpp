// -*-Mode: C++;-*-
//
// Molecular Parameter Manager
//
// $Id: ParamDB.hpp,v 1.2 2011/03/16 17:24:11 rishitani Exp $

#ifndef PARAM_MANAGER_HPP_INCLUDED
#define PARAM_MANAGER_HPP_INCLUDED

#include "molstr.hpp"
#include "ParamDBDetail.hpp"

namespace molstr {

  using qlib::LString;

  class MOLSTR_API ParamDB
  {
  private:
    /*
    /// Bond energy parameters
    param::BondDict m_bondDict;
    
    /// Angle energy parameters
    param::AnglDict m_anglDict;
    
    /// Dihedral and improper energy parameters
    param::DiheDict m_diheDict;
    
    /// Non-bonded energy term (L.J. param)
    param::NonbDict m_nonbDict;
     */
    
    /// Atom parameters
    param::AtomDict m_atomDict;

  public:
    ParamDB();
    virtual ~ParamDB();

    bool addAtom(const LString &id)
    {
      return m_atomDict.insert(param::AtomDict::value_type(id, param::AtomVal())).second;
    }
    param::AtomVal *getAtom(const LString &id)
    {
      param::AtomDict::iterator i = m_atomDict.find(id);
      if (i==m_atomDict.end())
        return NULL;
      return &(i->second);
    }

    //////////

    /// add bond parameter
    bool addBondPar(const LString &atomi,
		    const LString &atomj,
		    double kf, double r0)
    {
      return true;
    }

    /// Search bond parameter
    /// @returns true if found
    bool searchBondPar(const LString &atomi,
		       const LString &atomj,
		       double &kf, double &r0) const
    {
      return true;
    }

    /// add angle parameter
    bool addAnglPar(const LString &atomi,
		    const LString &atomj,
		    const LString &atomk,
		    double kf, double r0)
    {
      return true;
    }

    /// search angle parameter
    bool searchAnglPar(const LString &atomi,
		       const LString &atomj,
		       const LString &atomk,
		       double &kf, double &r0) const
    {
      return true;
    }

    /// add dihedral/improper parameter
    bool addDihePar(const LString &atomi,
		    const LString &atomj,
		    const LString &atomk,
		    const LString &atoml,
		    double kf, double pe, double del)
    {
      return true;
    }


    /** search dihedral parameter
	@returns true if found
    */
    bool searchDihePar(const LString &atomi,
		       const LString &atomj,
		       const LString &atomk,
		       const LString &atoml,
		       double &kf, double &pe, double &del) const
    {
      return true;
    }

    /** search improper parameter
	@returns true if found
    */
    bool searchImprPar(const LString &atomi,
		       const LString &atomj,
		       const LString &atomk,
		       const LString &atoml,
		       double &kf, double &pe, double &del) const
    {
      return true;
    }

    /// add nonbonded parameter
    bool addNonbPar(const LString &atom,
		    double eps, double sig, double eps14, double sig14)
    {
      return true;
    }

    /**
       search improper parameter
       @returns true if found
    */
    bool searchNonbPar(const LString &atom,
		       double &eps, double &sig,
		       double &eps14, double &sig14) const
    {
      return true;
    }

    void dump() const {}

  private:
    bool searchDiheHelper(param::DiheTag &tag, param::DiheVal &val) const;

  };

}

#endif
