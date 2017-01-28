// -*-Mode: C++;-*-
//
//  Tube tesselation class
//

#ifndef TUBE_TESS_HPP_INCLUDED
#define TUBE_TESS_HPP_INCLUDED

namespace molvis {

  template <class _Rend, class _Seg=typename _Rend::SplSeg, class _DrawSeg=typename _Rend::DrawSeg, class _VertArray=typename _DrawSeg::VertArray>
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

    int m_nVerts;
    int m_nFaces;

    int m_nAxPts;
    int m_nvdup;
    int m_nSecDiv;

    _VertArray *m_pTarg;

    _VertArray *getTarget() const {
      return m_pTarg;
    }
    void setTarget(_VertArray *pTarg) {
      m_pTarg = pTarg;
    }

    //void calcSize(int nAxPts, int nSecDiv, int nStartCapType, int nEndCapType, bool bSmoCol,
    //int &rnvert, int &rnface)
    void calcSize( _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS,
                  int &rnvert, int &rnface)
    {
      const int nDetail = pRend->getAxialDetail();
      const int nSecDiv = pRend->getTubeSection()->getSize();

      const int nsplseg = pDS->m_nEnd - pDS->m_nStart;
      const int nAxPts = nDetail * nsplseg + 1;
      pDS->m_nAxPts = nAxPts;

      const int nStartCapType = pRend->getStartCapType();
      const int nEndCapType = pRend->getEndCapType();
      const bool bSmoCol = pRend->isSmoothColor();

      m_nSecDiv = nSecDiv;
      m_nAxPts = nAxPts;

      const int nSphr = nSecDiv/2;


      const float fDetail = float(nDetail);
      const float fStart = float(pDS->m_nStart);

      // check vertex duplication for non-contiguous coloring
      m_nvdup = 0;
      if (!bSmoCol) {
        /*
        MolCoordPtr pCMol = pRend->getClientMol();
        quint32 cc_prev = 0;
        for (int i=pDS->m_nStart; i<=pDS->m_nEnd; ++i) {
          quint32 cc = pSeg->calcColor(pRend, pCMol, float(i));
          if (i!=pDS->m_nStart) {
            if (cc!=cc_prev)
              vdup ++;
          }
          cc_prev = cc;
	  }*/
        m_nvdup = nsplseg;
      }
      
      m_nbody_verts = (nAxPts+m_nvdup) * nSecDiv;
      m_nbody_faces = nSecDiv * (nAxPts+m_nvdup-1) * 2;

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

      rnvert = m_nVerts = m_nbody_verts + m_nStCapVerts + m_nEnCapVerts;
      rnface = m_nFaces = m_nbody_faces + m_nStCapFaces + m_nEnCapFaces;
    }

    ////////////////////////////
    // Tube Body
    
    /// Generate body indices
    void makeBodyInd(int &ind, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      const int nDetail = pRend->getAxialDetail();
      const int iGap = nDetail/2;
      const bool bSmoCol = pRend->isSmoothColor();

      //_VertArray *pVBO = m_pTarg;
      int i, j;
      int ij, ijp, ipj, ipjp;
      int irow;
      int k;
      bool bPrevGap =false;

      for (i=0,k=0; i<m_nAxPts+m_nvdup-1; ++i) {

	if (!bSmoCol) {
	  const int ii = k%nDetail;
	  if (ii==iGap && !bPrevGap) {
	    // skip
	    //MB_DPRINTLN("skip iGap=%d, i=%d, k=%d", iGap, i, k);
	    bPrevGap = true;
	    continue;
	  }
	}

        irow = i*m_nSecDiv;
        for (j=0; j<m_nSecDiv; ++j) {
          ij = irow + j;
          ipj = ij + m_nSecDiv;
          ijp = irow + (j+1)%m_nSecDiv;
          ipjp = irow + m_nSecDiv + (j+1)%m_nSecDiv;
          m_pTarg->setIndex3(ind, ij, ijp, ipjp);
          ++ind;
          m_pTarg->setIndex3(ind, ipjp, ipj, ij);
          ++ind;
        }
	++k;
	bPrevGap=false;
	MB_DPRINTLN("Face i=%d, (k=%d)", i, k);
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
      //_DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      Vector3F pos, e0, e1, e2;
      Vector3F g, dg;

      for (i=0; i<nAxPts; ++i) {
        pSeg->getBasisVecs(float(i)/fDetail + fStart, pos, e0, e1, e2);
        for (j=0; j<nSecDiv; ++j) {
          const Vector4D &stab = pTS->getSectTab(j);
          g = e1.scale( float(stab.x()) ) + e2.scale( float(stab.y()) );
          dg = e1.scale( float(stab.z()) ) + e2.scale( float(stab.w()) );
          m_pTarg->vertex3f(ind, pos + g);
          m_pTarg->normal3f(ind, dg);
          ++ind;
        }
      }
    }

    /// Set body colors
    void setBodyColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int i, j;
      float par;

      const float fDetail = float(pRend->getAxialDetail());
      const float fStart = float(pDS->m_nStart);
      const bool bSmoCol = pRend->isSmoothColor();

      // body
      for (i=0; i<m_nAxPts; ++i) {
        par = float(i)/fDetail + fStart;

        m_pTarg->color2(pSeg->calcColorPtr(pRend, pCMol, par), pRend->getSceneID());
        for (j=0; j<m_nSecDiv; ++j) {
          m_pTarg->color2(ind);
          ++ind;
        }
      }
    }

    ////////////////////////////

    /// spherical cap index
    void makeSphrCapInd(int &ind, bool bStart)
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
            m_pTarg->setIndex3(ind  , ij, ipjp, ijp);
            m_pTarg->setIndex3(ind+1, ipjp, ij, ipj);
          }
          else {
            m_pTarg->setIndex3(ind  , ij, ijp, ipjp);
            m_pTarg->setIndex3(ind+1, ipjp, ipj, ij);
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
          m_pTarg->setIndex3(ind, itop, ijp, ij);
        else
          m_pTarg->setIndex3(ind, itop, ij, ijp);
        ++ind;
      }
    }
    
    void setSphrCapVerts(int &ind, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS, bool bStart)
    {
      int i, j;
      const int nSecDiv = m_nSecDiv; //pTS->getSize();
      const int nsphr = nSecDiv/2; //getAxialDetail();
      Vector3F pos, e0, e1, e2;
      //_DrawSeg::VertArray *pVBO = pDS->m_pVBO;
      
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

          m_pTarg->vertex3f(ind, pos1 + g1);
	  m_pTarg->normal3f(ind, dg1);
	  ++ind;
	}
      }      
      m_pTarg->vertex3f(ind, pos + v0);
      m_pTarg->normal3f(ind, e0.scale(sign));
      ++ind;
    }

    void setSphrCapColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, bool bStart)
    {
      int i, j;

      const int nSecDiv = m_nSecDiv; //pTS->getSize();
      const int nsphr = m_nSecDiv/2;

      // const float fDetail = float(pRend->getAxialDetail());
      //_DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      float par;
      if (bStart)
        par = float(pDS->m_nStart);
      else
        par = float(pDS->m_nEnd);

      m_pTarg->color2(pSeg->calcColorPtr(pRend, pCMol, par), pRend->getSceneID());

      for (i=0; i<nsphr; i++) {
	for (j=0; j<nSecDiv; ++j) {
          m_pTarg->color2(ind);
	  ++ind;
	}
      }
      m_pTarg->color2(ind);
      ++ind;

    }

    ////////////////////////////

    /// flat cap index
    void makeFlatCapInd(int &ind, bool bStart)
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
          m_pTarg->setIndex3(ind, ibase, ijp, ij);
        else
          m_pTarg->setIndex3(ind, ibase, ij, ijp);
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
      //_DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      float par;
      if (bStart)
        par = float(pDS->m_nStart);
      else
        par = float(pDS->m_nEnd);

      pSeg->getBasisVecs(par, pos, e0, e1, e2);
      m_pTarg->vertex3f(ind, pos);
      m_pTarg->normal3f(ind, e0.scale(sign));
      ++ind;
      for (j=0; j<nSecDiv; ++j) {
	const Vector4D &stab = pTS->getSectTab(j);
        g = e1.scale( float(stab.x()) ) + e2.scale( float(stab.y()) );
	m_pTarg->vertex3f(ind, pos + g);
        m_pTarg->normal3f(ind, e0.scale(sign));
        ++ind;
      }
    }

    void setFlatCapColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, bool bStart)
    {
      int j;

      const int nSecDiv = m_nSecDiv;
      //_DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      float par;
      if (bStart)
        par = float(pDS->m_nStart);
      else
        par = float(pDS->m_nEnd);

      m_pTarg->color2(pSeg->calcColorPtr(pRend, pCMol, par), pRend->getSceneID());

      m_pTarg->color2(ind);
      ++ind;
      for (j=0; j<nSecDiv; ++j) {
        m_pTarg->color2(ind);
        ++ind;
      }
    }


    ////////////////////////////

    void makeIndex(_Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int ind = 0;
      //typename _DrawSeg::VertArray *pVBO = pDS->m_pVBO;

      makeBodyInd(ind, pRend, pSeg, pDS);

      if (pRend->getStartCapType()==_Rend::CAP_SPHR) {
        makeSphrCapInd(ind, true);
      }
      else {
        makeFlatCapInd(ind, true);
      }

      if (pRend->getEndCapType()==_Rend::CAP_SPHR) {
        makeSphrCapInd(ind, false);
      }
      else {
        makeFlatCapInd(ind, false);
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

