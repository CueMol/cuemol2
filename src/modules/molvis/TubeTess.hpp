// -*-Mode: C++;-*-
//
//  Tube tesselation class
//

#ifndef TUBE_TESS_HPP_INCLUDED
#define TUBE_TESS_HPP_INCLUDED

namespace molvis {

  template <class _Rend, class _Seg=_Rend::SplSeg, class _DrawSeg=_Rend::DrawSeg>
  class TubeTess
  {
  public:
    TubeTess() {}

    int m_nbody_verts;
    int m_nbody_faces;
    int m_nStCapVerts;
    int m_nStCapFaces;
    int m_nEnCapVerts;
    int m_nEnCapFaces;

    int m_nAxPts;
    int m_nSecDiv;

    void calcSize(int nAxPts, int nSecDiv, int nStartCapType, int nEndCapType,
                  int &rnvert, int &rnface)
    {
      m_nSecDiv = nSecDiv;
      m_nAxPts = nAxPts;

      const int nSphr = nSecDiv/2;

      m_nbody_verts = nAxPts * nSecDiv;
      m_nbody_faces = nSecDiv * (nAxPts-1) * 2;

      // Start capping
      if (nStartCapType==SplineRendBase::CAP_SPHR) {
        // spherical cap
        m_nStCapVerts = nSphr*nSecDiv +1;
        m_nStCapFaces = (nSphr-1)*nSecDiv*2 + nSecDiv;
      }
      else {
        // flat cap
        m_nStCapVerts = nSecDiv + 1;
        m_nStCapFaces = nSecDiv;
      }

      // End capping
      if (nEndCapType==SplineRendBase::CAP_SPHR) {
        // spherical cap
        m_nEnCapVerts = nSphr*nSecDiv +1;
        m_nEnCapFaces = (nSphr-1)*nSecDiv*2 + nSecDiv;
      }
      else {
        // flat cap
        m_nEnCapVerts = nSecDiv + 1;
        m_nEnCapFaces = nSecDiv;
      }

      rnvert = m_nbody_verts + m_nStCapVerts + m_nEnCapVerts;
      rnface = m_nbody_faces + m_nStCapFaces + m_nEnCapFaces;
    }

    ////////////////////////////
    // Tube Body
    
    /// Generate body indices
    void makeBodyInd(int &ind, typename _DrawSeg::VertArray *pVBO)
    {
      int i, j;
      int ij, ijp, ipj, ipjp;
      int ibase = 0, irow;

      // body
      for (i=0; i<m_nAxPts-1; ++i) {
        irow = i*m_nSecDiv + ibase;
        for (j=0; j<m_nSecDiv; ++j) {
          ij = irow + j;
          ipj = ij + m_nSecDiv;
          ijp = irow + (j+1)%m_nSecDiv;
          ipjp = irow + m_nSecDiv + (j+1)%m_nSecDiv;
          pVBO->setIndex3(ind, ij, ijp, ipjp);
          ++ind;
          pVBO->setIndex3(ind, ipjp, ipj, ij);
          ++ind;
        }
      }
    }

    /// Set body verteces
    void setBodyVerts(int &ind, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS)
    {
      int i, j;

      const float fDetail = float(pRend->getAxialDetail());
      const float fStart = float(pDS->m_nStart);
      const int nAxPts = pDS->m_nAxPts;
      const int nSecDiv = m_nSecDiv; //pTS->getSize();
      _DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      Vector3F pos, e0, e1, e2;
      Vector3F g, dg;

      for (i=0; i<nAxPts; ++i) {
        pSeg->getBasisVecs(float(i)/fDetail + fStart, pos, e0, e1, e2);
        for (j=0; j<nSecDiv; ++j) {
          const Vector4D &stab = pTS->getSectTab(j);
          g = e1.scale( float(stab.x()) ) + e2.scale( float(stab.y()) );
          dg = e1.scale( float(stab.z()) ) + e2.scale( float(stab.w()) );
          pVBO->vertex3f(ind, pos + g);
          pVBO->normal3f(ind, dg);
          ++ind;
        }
      }
    }

    /// Set body colors
    void setBodyColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int i, j;
      float par;
      quint32 dcc;

      const float fDetail = float(pRend->getAxialDetail());
      const float fStart = float(pDS->m_nStart);
      _DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      // body
      for (i=0; i<m_nAxPts; ++i) {
        par = float(i)/fDetail + fStart;
        dcc = pSeg->calcColor(pRend, pCMol, par);
        for (j=0; j<m_nSecDiv; ++j) {
          pVBO->color(ind, dcc);
          ++ind;
        }
      }
    }

    ////////////////////////////

    /// spherical cap index
    void makeSphrCapInd(int &ind, typename _DrawSeg::VertArray *pVBO, bool bStart)
    {
      const int nSecDiv = m_nSecDiv;
      const int nSphr = m_nSecDiv/2;

      int i, j;
      int ij, ijp, ipj, ipjp;
      int ibase, irow;

      if (bStart)
        ibase = m_nbody_verts;
      else
        ibase = m_nbody_verts + m_nStCapVerts;

      for (i=0; i<nSphr-1; ++i) {
        irow = i*nSecDiv + ibase;
        for (j=0; j<nSecDiv; ++j) {
          ij = irow + j;
          ipj = ij + nSecDiv;
          ijp = irow + (j+1)%nSecDiv;
          ipjp = irow + nSecDiv + (j+1)%nSecDiv;
          if (bStart) {
            pVBO->setIndex3(ind  , ij, ipjp, ijp);
            pVBO->setIndex3(ind+1, ipjp, ij, ipj);
          }
          else {
            pVBO->setIndex3(ind  , ij, ijp, ipjp);
            pVBO->setIndex3(ind+1, ipjp, ipj, ij);
          }
          ind+=2;
        }
      }
      
      irow = (nSphr-1)*nSecDiv + ibase;
      const int itop = irow+nSecDiv;
      for (j=0; j<nSecDiv; ++j) {
        ij = irow + j;
        ijp = irow + (j+1)%nSecDiv;
        if (bStart)
          pVBO->setIndex3(ind, itop, ijp, ij);
        else
          pVBO->setIndex3(ind, itop, ij, ijp);
        ++ind;
      }
    }
    
    void setSphrCapVerts(int &ind, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS, bool bStart)
    {
      int i, j;
      const int nSecDiv = m_nSecDiv; //pTS->getSize();
      const int nsphr = nSecDiv/2; //getAxialDetail();
      Vector3F pos, e0, e1, e2;
      _DrawSeg::VertArray *pVBO = pDS->m_pVBO;
      
      float sign;
      float fStart;
      if (bStart) {
        sign = -1.0f;
        fStart = float(pDS->m_nStart);
      }
      else {
        sign = 1.0f;
        fStart = float(pDS->m_nEnd);
      }

      pSeg->getBasisVecs(fStart, pos, e0, e1, e2);
      const float v0len = pTS->getVec(0, e1, e2).length();
      Vector3F v0 = e0.scale(sign*v0len);

      for (i=0; i<nsphr; i++) {
        //const float t = float(i)/float(nsphr);
        //const float gpar = ::sqrt(1.0-t*t);
        const float t = sinf(float(M_PI)*0.5f*float(i)/float(nsphr));
        const float gpar = sqrtf(1.0f-t*t);
	
	Vector3F pos1 = pos + v0.scale(t);
	Vector3F e11 = e1.scale(gpar);
	Vector3F e12 = e2.scale(gpar);

	for (j=0; j<nSecDiv; ++j) {
	  const Vector4D &stab = pTS->getSectTab(j);

          Vector3F g1 = e11.scale(stab.x()) + e12.scale(stab.y());
          Vector3F dg1 = e1.scale(stab.z()) + e2.scale(stab.w());
          float ldg1 = dg1.length();
          dg1 = dg1.scale(gpar) + e0.scale(sign*t*ldg1);

          pVBO->vertex3f(ind, pos1 + g1);
	  pVBO->normal3f(ind, dg1);
	  ++ind;
	}
      }      
      pVBO->vertex3f(ind, pos + v0);
      pVBO->normal3f(ind, e0.scale(sign));
      ++ind;
    }

    void setSphrCapColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, bool bStart)
    {
      int i, j;

      const int nSecDiv = m_nSecDiv; //pTS->getSize();
      const int nsphr = m_nSecDiv/2;

      // const float fDetail = float(pRend->getAxialDetail());
      _DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      float par;
      if (bStart)
        par = float(pDS->m_nStart);
      else
        par = float(pDS->m_nEnd);

      quint32 dcc = pSeg->calcColor(pRend, pCMol, par);

      for (i=0; i<nsphr; i++) {
	for (j=0; j<nSecDiv; ++j) {
          pVBO->color(ind, dcc);
	  ++ind;
	}
      }
      pVBO->color(ind, dcc);
      ++ind;

    }

    ////////////////////////////

    /// flat cap index
    void makeFlatCapInd(int &ind, typename _DrawSeg::VertArray *pVBO, bool bStart)
    {
      const int nSecDiv = m_nSecDiv;

      int j;
      int ij, ijp;//, ipj, ipjp;
      int ibase, irow;
      
      if (bStart)
        ibase = m_nbody_verts;
      else
        ibase = m_nbody_verts + m_nStCapVerts;
      
      
      irow = ibase + 1;
      for (j=0; j<nSecDiv; ++j) {
        ij = irow + j;
        ijp = irow + (j+1)%nSecDiv;
        if (bStart)
          pVBO->setIndex3(ind, ibase, ijp, ij);
        else
          pVBO->setIndex3(ind, ibase, ij, ijp);
        ++ind;
      }
    }

    void setFlatCapVerts(int &ind, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS, bool bStart)
    {
      int i, j;
      const float sign = bStart?-1.0f:1.0f;
      const int nSecDiv = m_nSecDiv; //pTS->getSize();
      const int nsphr = nSecDiv/2; //getAxialDetail();
      Vector3F pos, e0, e1, e2, g;
      _DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      float par;
      if (bStart)
        par = float(pDS->m_nStart);
      else
        par = float(pDS->m_nEnd);

      pSeg->getBasisVecs(par, pos, e0, e1, e2);
      pVBO->vertex3f(ind, pos);
      pVBO->normal3f(ind, e0.scale(sign));
      ++ind;
      for (j=0; j<nSecDiv; ++j) {
	const Vector4D &stab = pTS->getSectTab(j);
        g = e1.scale( float(stab.x()) ) + e2.scale( float(stab.y()) );
	pVBO->vertex3f(ind, pos + g);
        pVBO->normal3f(ind, e0.scale(sign));
        ++ind;
      }
    }

    void setFlatCapColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, bool bStart)
    {
      int i, j;

      const int nSecDiv = m_nSecDiv;
      _DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      float par;
      if (bStart)
        par = float(pDS->m_nStart);
      else
        par = float(pDS->m_nEnd);

      quint32 dcc = pSeg->calcColor(pRend, pCMol, par);

      pVBO->color(ind, dcc);
      ++ind;
      for (j=0; j<nSecDiv; ++j) {
        pVBO->color(ind, dcc);
        ++ind;
      }
    }


    ////////////////////////////

    void makeIndex(_Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int ind = 0;
      typename _DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      makeBodyInd(ind, pVBO);

      if (pRend->getStartCapType()==_Rend::CAP_SPHR) {
        makeSphrCapInd(ind, pVBO, true);
      }
      else {
        makeFlatCapInd(ind, pVBO, true);
      }

      if (pRend->getEndCapType()==_Rend::CAP_SPHR) {
        makeSphrCapInd(ind, pVBO, false);
      }
      else {
        makeFlatCapInd(ind, pVBO, false);
      }
    }

    void setVerts(_Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS)
    {
      int ind = 0;

      setBodyVerts(ind, pRend, pSeg, pDS, pTS);
      
      if (pRend->getStartCapType()==_Rend::CAP_SPHR) {
        setSphrCapVerts(ind, pRend, pSeg, pDS, pTS, true);
      }
      else {
        setFlatCapVerts(ind, pRend, pSeg, pDS, pTS, true);
      }

      if (pRend->getEndCapType()==_Rend::CAP_SPHR) {
        setSphrCapVerts(ind, pRend, pSeg, pDS, pTS, false);
      }
      else {
        setFlatCapVerts(ind, pRend, pSeg, pDS, pTS, false);
      }

    }
    
    void setColors(const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int ind = 0;

      setBodyColors(ind, pCMol, pRend, pSeg, pDS);
      
      if (pRend->getStartCapType()==_Rend::CAP_SPHR) {
        setSphrCapColors(ind, pCMol, pRend, pSeg, pDS, true);
      }
      else {
        setFlatCapColors(ind, pCMol, pRend, pSeg, pDS, true);
      }

      if (pRend->getEndCapType()==_Rend::CAP_SPHR) {
        setSphrCapColors(ind, pCMol, pRend, pSeg, pDS, false);
      }
      else {
        setFlatCapColors(ind, pCMol, pRend, pSeg, pDS, false);
      }

    }

  };

}

#endif

