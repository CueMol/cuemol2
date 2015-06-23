// -*-Mode: C++;-*-
//
// Molecular surface object
//

#ifndef MOL_SURF_OBJ_HPP_INCLUDED
#define MOL_SURF_OBJ_HPP_INCLUDED

#include "surface.hpp"
#include "MSGeomTypes.hpp"

#include <qlib/Vector4D.hpp>
#include <qsys/Object.hpp>
#include <qlib/LDOM2Stream.hpp>

#include <modules/molstr/Selection.hpp>
#include <modules/molstr/molstr.hpp>

namespace surface {

  using qlib::Vector4D;
  class MolSurfEditInfo;
  using molstr::MolCoordPtr;
  using molstr::SelectionPtr;

  // #define USE_VERT_TYPE_ID

  class SURFACE_API MolSurfObj : public qsys::Object
  {
    MC_SCRIPTABLE;

    friend class CutByPlane;
    friend class CutByPlane2;
    friend class MolSurfEditInfo;

  public:

#ifdef USE_VERT_TYPE_ID
    /** for debug */
    enum {
      FTID_NONE = 0,
      FTID_DBG1 = 1,
      FTID_DBG2 = 2,
      FTID_DBG3 = 3,
      FTID_DBG4 = 4,
      FTID_DBG5 = 5,
      FTID_DBG6 = 6,
      FTID_DBG7 = 7
    };
#endif

  private:
    //
    //  Surface Data
    //

    int m_nVerts;
    MSVert *m_pVerts;

    int m_nFaces;
    MSFace *m_pFaces;

  public:

    /*
  mutable std::deque<std::pair<Vector4D, LString> > m_dbg;

  void dbgmsg(const Vector4D &v, const LString &str) const
  {
    m_dbg.push_back(std::pair<Vector4D, LString>(v, str));
  }
     */

    ////////////////////////////////////////////
  public:

    MolSurfObj();

    virtual ~MolSurfObj();

    ////////////////////////////////////////////
    // MbObject operations

    virtual bool isEmpty() const;

    virtual void deleteSelected();

    //virtual MbSelection *interpHit(Hittest *phit) const;
    //virtual void clicked(MbSelection *psel);

    ////////////////////////////////////////////
    // construction

    /// Cleanup all data
    void clean();

    /// Set vertex array size
    bool setVertSize(int n) {
      MB_ASSERT(n>=1);
      if (m_pVerts!=NULL)
        delete [] m_pVerts;
      m_pVerts = MB_NEW MSVert[n];
      if (m_pVerts==NULL) return false;
      m_nVerts = n;
      return true;
    }

    /// Load [index]th vertex element
    bool setVertex(int index, const Vector4D &vec, const Vector4D &norm) {
      MB_ASSERT(m_pVerts!=NULL);
      MB_ASSERT(index>=0 && index<m_nVerts);
      m_pVerts[index].x = (float) vec.x();
      m_pVerts[index].y = (float) vec.y();
      m_pVerts[index].z = (float) vec.z();
      m_pVerts[index].nx = (float) norm.x();
      m_pVerts[index].ny = (float) norm.y();
      m_pVerts[index].nz = (float) norm.z();
      return true;
    }

    void setVertex(int index, const MSVert &v) {
      m_pVerts[index] = v;
    }

    /// Set face array size
    bool setFaceSize(int n) {
      MB_ASSERT(n>=1);
      if (m_pFaces!=NULL)
        delete [] m_pFaces;
      m_pFaces = MB_NEW MSFace[n];

      m_nFaces = n;
      return true;
    }

    /// Load [index]th face element
    bool setFace(int index, int id1, int id2, int id3) {
      MB_ASSERT(index>=0 && index<m_nFaces);
      m_pFaces[index].id1 = id1;
      m_pFaces[index].id2 = id2;
      m_pFaces[index].id3 = id3;
      return true;
    }

    void setFace(int index, const MSFace &f) {
      MB_ASSERT(index>=0 && index<m_nFaces);
      m_pFaces[index] = f;
    }

    ////////////////////////////////////////
    // data extraction

    int getVertSize() const { return m_nVerts; }

    const MSVert &getVertAt(int i) const {
      MB_ASSERT(m_pVerts!=NULL);
      MB_ASSERT(i>=0 && i<m_nVerts);
      return m_pVerts[i];
    }

    //

    int getFaceSize() const { return m_nFaces; }

    const MSFace &getFaceAt(int i) const {
      MB_ASSERT(m_pFaces!=NULL);
      MB_ASSERT(i>=0 && i<m_nFaces);
      return m_pFaces[i];
    }

    MSVert *getVertPtr() const {
      return m_pVerts;
    }
    MSFace *getFacePtr() const {
      return m_pFaces;
    }

    //////////
    // tools

    void cutByPlane(double cdiv, const Vector4D &norm, const Vector4D &pos, bool bSec);
    void cutByPlane2(double cdiv, const Vector4D &norm, const Vector4D &pos, bool bBody, bool bSec);

    void createSESFromMol(MolCoordPtr pMol, SelectionPtr pSel, double density, double probe_r);

    void createSESFromArray(const std::vector<Vector4D> &pr_ary, double density, double probe_r);
    
    void createHoleTest1(MolCoordPtr pMol, const Vector4D &dirnorm, const Vector4D &startpos);

    ////////////////////////////////////////////

  private:
    /// Molecule object name by which this molsurf obj generated (persistent)
    LString m_sOrigMol;

    /// Molecule object ID by which this molsurf obj generated (non-persistent)
    qlib::uid_t m_nOrigMolID;

    /// Selection of OrigMol used for the generation of this molsurf obj
    SelectionPtr m_pMolSel;

    double m_dDensity;

    double m_dProbeRad;

  public:
    void setOrigMolName(const LString &nm) { m_sOrigMol = nm; }
    const LString &getOrigMolName() const { return m_sOrigMol; }

    SelectionPtr getOrigSel() const { return m_pMolSel; }
    void setOrigSel(SelectionPtr pNewSel) { m_pMolSel = pNewSel; }

    void setOrigDen(double val) { m_dDensity = val; }
    double getOrigDen() const { return m_dDensity; }

    void setOrigProbeRad(double val) { m_dProbeRad = val; }
    double getOrigProbeRad() const { return m_dProbeRad; }


    void regenerateSES(double density, double probe_r=-1.0, SelectionPtr pSel=SelectionPtr());

  public:

    ////////////////////////////////////////////
    // Data chunk serialization

    virtual bool isDataSrcWritable() const { return true; }
    virtual LString getDataChunkReaderName() const;
    virtual void writeDataChunkTo(qlib::LDom2OutStream &oos) const;

  };

}


#endif // MOL_SURF_OBJ_HPP_INCLUDED

