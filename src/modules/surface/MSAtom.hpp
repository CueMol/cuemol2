// -*-Mode: C++;-*-
//
//  Atom class for molsurf builder
//

#ifndef MOL_SURF_ATOM_HPP_INCLUDED
#define MOL_SURF_ATOM_HPP_INCLUDED

#include "surface.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Array.hpp>

namespace surface {
  
  using qlib::Vector4D;
  class RSEdge;
  class RSVert;
  
  class MSAtom
  {
  public:
    /// AtomID in the target molecule obj
    int aid;
    
    /// pointer to the RSVert obj/NULL if this atom is NOT RSVert
    RSVert *pVert;
    
    Vector4D pos;
    
    double rad;
    
  public:
    MSAtom() : aid(-1), pVert(NULL), rad(0.0) {}
    
    MSAtom(const MSAtom &src)
         : aid(src.aid), pos(src.pos), rad(src.rad)
    {
    }
    
    // std::list<RSEdge *> m_edges;
    
  };
  
  typedef qlib::Array<MSAtom> MSAtomArray;

}

#endif

