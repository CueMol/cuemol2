// -*-Mode: C++;-*-
//
//  Interaction line data class
//

#ifndef MOLVIS_ATOM_INTR_DATA_HPP_INCLUDED
#define MOLVIS_ATOM_INTR_DATA_HPP_INCLUDED

#include "molvis.hpp"
#include <modules/molstr/Selection.hpp>
#include <modules/molstr/molstr.hpp>
#include <qlib/Vector4D.hpp>
#include <qsys/EditInfo.hpp>

namespace gfx {
  class PixelBuffer;
}

namespace molvis {

using qlib::Vector4D;
using molstr::SelectionPtr;
using molstr::ResidIndex;

struct AtomIntrElem
{
  /// target molecule ID
  mutable qlib::uid_t nMolID;

  /// Target molecule's name
  LString molName;

  /// value mode
  int nMode;

  /// value mode constants
  enum {
    AI_SEL = 0,
    AI_AID = 1,
    AI_POS = 2
  };

  /// Selection mode
  SelectionPtr pSel;

  /// Atom ID value in aid mode
  int nAtomID;

  /// String atom ID in aid mode
  LString strAid;

  /// Position mode
  Vector4D pos;

  ////////////////////

  AtomIntrElem() : nMolID(qlib::invalid_uid), nMode(AI_POS), nAtomID(-1) {}

  void setMolName(const LString &name) {
    nMolID = qlib::invalid_uid;
    molName = name;
  }

  void setSel(SelectionPtr aSel) {
    pSel = aSel;
    nMode = AI_SEL;
  }

  void setAtomID(int aID) {
    nAtomID = aID;
    nMode = AI_AID;
  }

  void setPos(const Vector4D &v) {
    pos = v;
    nMode = AI_POS;
  }
};

struct AtomIntrData
{
  /// label mode (invalid:0/dist:1/angl:2/tors:3)
  int nmode;

  AtomIntrElem elem0;
  AtomIntrElem elem1;
  AtomIntrElem elem2;
  AtomIntrElem elem3;

  /// Label work area
  int m_nLabelCacheID;

  ////////////////////

  AtomIntrData() : nmode(0), m_nLabelCacheID(-1)
  {
  }

  //~AtomIntrData();
  
  ////////////////////

  /// make distance data
  AtomIntrData(qlib::uid_t nMolID1, SelectionPtr pSel1,
               qlib::uid_t nMolID2, SelectionPtr pSel2)
       : nmode(1)
    {
      elem0.setSel(pSel1);
      elem0.nMolID = nMolID1;

      elem1.setSel(pSel2);
      elem1.nMolID = nMolID2;
    }

  /// make distance data by AID
  AtomIntrData(qlib::uid_t nMolID1, int nAid1, 
               qlib::uid_t nMolID2, int nAid2)
       : nmode(1)
    {
      elem0.setAtomID(nAid1);
      elem0.nMolID = nMolID1;

      elem1.setAtomID(nAid2);
      elem1.nMolID = nMolID2;
    }

  /// make angle data by AID
  AtomIntrData(qlib::uid_t nMolID1, int nAid1, 
               qlib::uid_t nMolID2, int nAid2,
               qlib::uid_t nMolID3, int nAid3)
       : nmode(2)
    {
      elem0.setAtomID(nAid1);
      elem0.nMolID = nMolID1;

      elem1.setAtomID(nAid2);
      elem1.nMolID = nMolID2;

      elem2.setAtomID(nAid3);
      elem2.nMolID = nMolID3;
    }

  /// make torsion data by AID
  AtomIntrData(qlib::uid_t nMolID1, int nAid1, 
               qlib::uid_t nMolID2, int nAid2,
               qlib::uid_t nMolID3, int nAid3,
               qlib::uid_t nMolID4, int nAid4)
       : nmode(3)
    {
      elem0.setAtomID(nAid1);
      elem0.nMolID = nMolID1;

      elem1.setAtomID(nAid2);
      elem1.nMolID = nMolID2;

      elem2.setAtomID(nAid3);
      elem2.nMolID = nMolID3;

      elem3.setAtomID(nAid4);
      elem3.nMolID = nMolID4;
    }

};

//bool operator==(const AtomIntrData &x, const AtomIntrData &y);

typedef std::vector<AtomIntrData> AtomIntrSet;

}

#endif

