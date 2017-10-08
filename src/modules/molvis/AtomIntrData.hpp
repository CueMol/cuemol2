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
#include <gfx/PixelBuffer.hpp>


namespace molvis {

  using qlib::Vector4D;
  using molstr::SelectionPtr;
  using molstr::ResidIndex;

  /// Element (point) of atom interaction (dist/angl/dihe) defs
  struct AtomIntrElem
  {
    /// Target molecule ID
    mutable qlib::uid_t nMolID;

    /// Target molecule name
    LString molName;

    /// Mode (selection/atom ID/position)
    int nMode;

    /// Mode constants
    enum {
      AI_SEL = 0,
      AI_AID = 1,
      AI_POS = 2
    };

    /// Sel obj in the selection mode
    SelectionPtr pSel;

    /// Atom ID value in the aid mode
    int nAtomID;

    /// String atom ID in the aid mode
    LString strAid;

    /// Cart coord in the position mode
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

    /// Label image cache ID (for atomintr impl)
    int nLabelCacheID;

    /// Label image pixel buffer (for atomintr2 impl)
    gfx::PixelBuffer *m_pPixBuf;

    ////////////////////

    AtomIntrData() : nmode(0), nLabelCacheID(-1), m_pPixBuf(NULL)
    {
    }

    ~AtomIntrData()
    {
      if (m_pPixBuf!=NULL)
        delete m_pPixBuf;
    }
  
    ////////////////////

    /// make distance data
    AtomIntrData(qlib::uid_t nMolID1, SelectionPtr pSel1,
		 qlib::uid_t nMolID2, SelectionPtr pSel2)
         : nmode(1), nLabelCacheID(-1), m_pPixBuf(NULL)
    {
      elem0.setSel(pSel1);
      elem0.nMolID = nMolID1;

      elem1.setSel(pSel2);
      elem1.nMolID = nMolID2;
    }

    /// make distance data by AID
    AtomIntrData(qlib::uid_t nMolID1, int nAid1, 
		 qlib::uid_t nMolID2, int nAid2)
      : nmode(1), nLabelCacheID(-1), m_pPixBuf(NULL)
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
      : nmode(2), nLabelCacheID(-1), m_pPixBuf(NULL)
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
         : nmode(3), nLabelCacheID(-1), m_pPixBuf(NULL)
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


  ////////////////////////////////////////////////////////////////
  ///
  ///  Undo/Redoable edit-information for structure-transformation
  ///

  template <class TRend>
  class AtomIntrEditInfo : public qsys::EditInfo
  {
  private:
    /// Target AtomIntr2Renderer ID
    qlib::uid_t m_nTgtUID;

    /// Interaction obj ID
    int m_nIntrID;

    /// interaction data added
    AtomIntrData m_data;

    /// remove or append
    bool m_bRemove;

  public:
    AtomIntrEditInfo()
    {
    }
  
    virtual ~AtomIntrEditInfo()
    {
    }      

    /////////////////////////////////////////////////////
    // Implementation

    void setup(qlib::uid_t rend_id, int id, const AtomIntrData &data) {
      m_nTgtUID = rend_id;
      m_nIntrID = id;
      m_data = data;
      m_bRemove = false;
    }

    void setupRemove(qlib::uid_t rend_id, int id, const AtomIntrData &data) {
      m_nTgtUID = rend_id;
      m_nIntrID = id;
      m_data = data;
      m_bRemove = true;
    }

    /////////////////////////////////////////////////////

    /// perform undo
    virtual bool undo()
    {
      TRend *pRend =
	qlib::ObjectManager::sGetObj<TRend>(m_nTgtUID);
      if (pRend==NULL)
	return false;
      if (!m_bRemove)
	pRend->remove(m_nIntrID);
      else
	pRend->setAt(m_nIntrID, m_data);
      return true;
    }
  
    /// perform redo
    virtual bool redo()
    {
      TRend *pRend =
	qlib::ObjectManager::sGetObj<TRend>(m_nTgtUID);
      if (pRend==NULL)
	return false;
      if (!m_bRemove)
	pRend->setAt(m_nIntrID, m_data);
      else
	pRend->remove(m_nIntrID);
      return true;
    }
  
    virtual bool isUndoable() const
    {
      return true;
    }

    virtual bool isRedoable() const
    {
      return true;
    }
  
  };

}

#endif

