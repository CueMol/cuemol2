// -*-Mode: C++;-*-
//
//  Topology builder
//
// $Id: TopoBuilder.hpp,v 1.2 2009/01/05 11:16:33 rishitani Exp $

#ifndef TOPO_BUILDER_H__
#define TOPO_BUILDER_H__

#include "molstr.hpp"

namespace molstr {

  using qlib::LString;

  class TopoDB;
  class ResiToppar;

  /// 
  /// Topology builder class.
  /// We only handles the bond topology here,
  /// because other information isn't required for the presentation purpose.
  ///
  class TopoBuilder
  {
  private:
    TopoDB *m_pTopDic;

    MolCoordPtr m_pMol;

    double m_distmat[4][4];

  public:
    static const int AUTOGEN_GLOBAL = 0;
    static const int AUTOGEN_SCENE = 1;
    static const int AUTOGEN_OBJECT = 2;
    static const int AUTOGEN_NONE = 3;

    void setAutogenMode(int nmode) { m_nAutogenMode = nmode; }

  private:
    int m_nAutogenMode;

  public:
    TopoBuilder(TopoDB *pdic);
    virtual ~TopoBuilder();

    void attachMol(MolCoordPtr pmol) {
      m_pMol = pmol;
    }

    void applyTopology();

  private:

    /**
       Apply topology to the residue (normal version)
       @param pRes The target residue
       @param ptop The topology object to use.
    */
    bool appTopoResid(MolResiduePtr pRes, ResiToppar *ptop);

    /**
       Apply topology to the residue, considering alternative conformations.
       @param pRes The target residue
       @param altconfs ID list of alt. confs.
       @param ptop The topology dictionary to use.
    */
    bool appTopoResidWithAltConf(MolResiduePtr pRes, const LString &altconfs, ResiToppar *ptop);

    /**
       Apply linker topology between two residues
       @param pRes1 The target residue.
       @param pRes2 The target residue.
       @param pdic The topology dictionary to use.
    */
    bool appTopo2Resids(MolResiduePtr pRes1, MolResiduePtr pRes2, TopoDB *pdic);

    /**
       Auto-generate topology data for unknown residue
    */
    // void autogen(MolResidue *pRes);
    void autogen(MolResiduePtr pRes, ResiToppar *pTop, qlib::uid_t uid = qlib::invalid_uid);

    bool chkBondDist(MolAtomPtr pAtom, MolAtomPtr pAtom2);

  };

}


#endif // TOPO_BUILDER_H__
