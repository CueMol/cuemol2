// -*-Mode: C++;-*-
//
//  Tube tesselation class
//

#ifndef TUBE_TESS_HPP_INCLUDED
#define TUBE_TESS_HPP_INCLUDED

namespace molvis {

  using qlib::Vector2D;

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
      TubeSectionPtr pTS = pRend->getTubeSection();
      const int nDetail = pRend->getAxialDetail();
      const int nSecDiv = pTS->getSize();

      const int nsplseg = pDS->m_nEnd - pDS->m_nStart;
      const int nAxPts = nDetail * nsplseg + 1;
      pDS->m_nAxPts = nAxPts;

      const int nStartCapType = pRend->getCapTypeImpl(pSeg, pDS, true);
      const int nEndCapType = pRend->getCapTypeImpl(pSeg, pDS, false);
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
      m_nbody_faces = nSecDiv * (nAxPts-1) * 2;

      // Start capping
      if (nStartCapType==SplineRendBase::CAP_SPHR) {
        // spherical cap
        m_nStCapVerts = nSphr*nSecDiv +1;
        m_nStCapFaces = (nSphr-1)*nSecDiv*2 + nSecDiv;
      }
      else if (nStartCapType==SplineRendBase::CAP_FLAT) {
        // flat cap
        m_nStCapVerts = nSecDiv + 1;
        m_nStCapFaces = nSecDiv;
      }
      else if (nStartCapType==SplineRendBase::XCAP_MSFLAT) {
        // flat cap/fancy section
        m_nStCapVerts = nSecDiv-1;
        m_nStCapFaces = nSecDiv;
      }
      else {
        m_nStCapVerts = 0;
        m_nStCapFaces = 0;
      }

      // End capping
      if (nEndCapType==SplineRendBase::CAP_SPHR) {
        // spherical cap
        m_nEnCapVerts = nSphr*nSecDiv +1;
        m_nEnCapFaces = (nSphr-1)*nSecDiv*2 + nSecDiv;
      }
      else if (nEndCapType==SplineRendBase::CAP_FLAT) {
        // flat cap
        m_nEnCapVerts = nSecDiv + 1;
        m_nEnCapFaces = nSecDiv;
      }
      else if (nEndCapType==SplineRendBase::XCAP_MSFLAT) {
        // flat cap/fancy section
        m_nEnCapVerts = nSecDiv-1;
        m_nEnCapFaces = nSecDiv;
      }
      else {
        m_nEnCapVerts = 0;
        m_nEnCapFaces = 0;
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
      const int iGap = int( floorf(float(nDetail)/2.0f) );
      const bool bSmoCol = pRend->isSmoothColor();

      //_VertArray *pVBO = m_pTarg;
      int i, j;
      int ij, ijp, ipj, ipjp;
      int irow;
      int k;
      bool bPrevGap =false;

      // k: spline parameter
      // i: mesh coordinate
      for (i=0,k=0; i<m_nAxPts+m_nvdup-1; ++i) {

	if (!bSmoCol) {
	  const int ii = k%nDetail;
	  if (ii==iGap && !bPrevGap) {
	    // skip
            MB_DPRINTLN("skip iGap=%d, i=%d, k=%d", iGap, i, k);
	    bPrevGap = true;
	    continue;
	  }
	}

        //MB_DPRINTLN("makeface i=%d - %d", i, i+1);
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
      }
    }

    /// Set body verteces
    void setBodyVerts(int &ind, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS)
    {
      int i, j, k;

      const int nDetail = pRend->getAxialDetail();
      const float fDetail = float(nDetail);
      const float fStart = float(pDS->m_nStart);
      const int nAxPts = pDS->m_nAxPts;
      const int nSecDiv = m_nSecDiv; //pTS->getSize();

      Vector3F pos, e0, e1, e2;
      Vector3F g, dg;

      const bool bSmoCol = pRend->isSmoothColor();
      const int iDup = int( floorf(fDetail/2.0f) );
      bool bPrevDup =false;

      // putty
      MolCoordPtr pCMol;
      Vector2D escl(1,1);
      bool bPutty = false;
      if (pRend->getPuttyMode()!=_Rend::TBR_PUTTY_OFF) {
        bPutty = true;
        pCMol = pRend->getClientMol();
      }

      // k: spline parameter
      // i: mesh coordinate
      for (i=0,k=0; i<m_nAxPts+m_nvdup; ++i) {
        //MB_DPRINTLN("set vert i=%d, k=%d", i, k);

        const float par = float(k)/fDetail + fStart;

        if (bPutty)
          escl = pRend->getEScl(pCMol, pSeg, par);
        pSeg->getBasisVecs(par, pos, e0, e1, e2);

        for (j=0; j<nSecDiv; ++j) {
          const Vector4D &stab = pTS->getSectTab(j);
          g = e1.scale( float(stab.x() * escl.x()) ) + e2.scale( float(stab.y() * escl.y()) );
          dg = e1.scale( float(stab.z()) ) + e2.scale( float(stab.w()) );
          m_pTarg->vertex3f(ind, pos + g);
          m_pTarg->normal3f(ind, dg);
          ++ind;
        }

	if (!bSmoCol) {
	  const int ii = k%nDetail;
	  if (ii==iDup && !bPrevDup) {
	    // duplicate mesh
	    //MB_DPRINTLN("skip iDup=%d, i=%d, k=%d", iDup, i, k);
	    bPrevDup = true;
	    continue;
	  }
	}

	++k;
	bPrevDup=false;
      }
    }

    /// Set body colors
    void setBodyColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int i, j, k;
      float par;

      const int nDetail = pRend->getAxialDetail();
      const float fDetail = float(nDetail);
      const float fStart = float(pDS->m_nStart);
      const bool bSmoCol = pRend->isSmoothColor();

      const int iDup = int( floorf(fDetail/2.0f) );
      bool bPrevDup =false;

      // k: spline parameter
      // i: mesh coordinate
      for (i=0,k=0; i<m_nAxPts+m_nvdup; ++i) {
        par = float(k)/fDetail + fStart;
	
        if (!bSmoCol) {
          const int ii = i%(nDetail+1);
          if (ii==iDup) {
            par -= 0.001f;
          }
          else if (ii==iDup+1) {
            par += 0.001f;
          }
	}

        //MB_DPRINTLN("set vertcol i=%d, k=%d", i, k);
        m_pTarg->color2(pSeg->calcColorPtr(pRend, pCMol, par), pRend->getSceneID());
        for (j=0; j<m_nSecDiv; ++j) {
          m_pTarg->color2(ind);
          ++ind;
        }

	if (!bSmoCol) {
	  const int ii = k%nDetail;
	  if (ii==iDup && !bPrevDup) {
	    // duplicate mesh
	    MB_DPRINTLN("duplicate iDup=%d, i=%d, k=%d", iDup, i, k);
	    bPrevDup = true;
	    continue;
	  }
	}

	++k;
	bPrevDup=false;
      }
    }

    ////////////////////////////

    void setIndex(bool bStart, int &ind, int i1, int i2, int i3)
    {
      if (bStart)
	m_pTarg->setIndex3(ind, i1, i3, i2);
      else
	m_pTarg->setIndex3(ind, i1, i2, i3);
      ++ind;
    } 

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
	setIndex(bStart, ind, itop, ij, ijp);
        /*if (bStart)
          m_pTarg->setIndex3(ind, itop, ijp, ij);
        else
          m_pTarg->setIndex3(ind, itop, ij, ijp);
	  ++ind;*/
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
      float fPar;
      if (bStart) {
        sign = -1.0f;
        fPar = float(pDS->m_nStart);
      }
      else {
        sign = 1.0f;
        fPar = float(pDS->m_nEnd);
      }

      pSeg->getBasisVecs(fPar, pos, e0, e1, e2);

      // putty
      if (pRend->getPuttyMode()!=_Rend::TBR_PUTTY_OFF) {
        MolCoordPtr pCMol = pRend->getClientMol();
        Vector2D escl = pRend->getEScl(pCMol, pSeg, fPar);
        e1 = e1.scale(float(escl.x()));
        e2 = e2.scale(float(escl.y()));
      }
      
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

          Vector3F g1 = e11.scale(float(stab.x())) + e12.scale(float(stab.y()));
          Vector3F dg1 = e1.scale(float(stab.z())) + e2.scale(float(stab.w()));
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
      int j;
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

      // putty
      if (pRend->getPuttyMode()!=_Rend::TBR_PUTTY_OFF) {
        MolCoordPtr pCMol = pRend->getClientMol();
        Vector2D escl = pRend->getEScl(pCMol, pSeg, par);
        e1 = e1.scale(float(escl.x()));
        e2 = e2.scale(float(escl.y()));
      }

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
    // Flat cap/MolScr section

    /// flat cap index
    void makeMsFlatCapInd(int &ind, bool bStart, const TubeSectionPtr &pTS)
    {
      const int nSecDiv = m_nSecDiv;

      int j;
      int ij, ijp;
      int ibase, icen;
      
      const int Nx = pTS->getMolScrNx();
      const int Ny = pTS->getMolScrNy();

      if (bStart)
        ibase = m_nbody_verts;
      else
        ibase = m_nbody_verts + m_nStCapVerts;
      
      
      // left circle (3 ~ Nx+3)
      icen = ibase+1;
      for (j=0; j<Nx; ++j) {
        ij = j+3+ibase;
        ijp = ij+1;
	setIndex(bStart, ind, icen, ij, ijp);
      }

      // right circle (Nx+4 ~ 2Nx+4)
      icen = ibase+2;
      for (j=0; j<Nx; j++) {
        ij = j+Nx+4+ibase;
        ijp = ij+1;
	setIndex(bStart, ind, icen, ij, ijp);
      }

      // front edge (2Nx+5 ~ 2Nx+Ny+3)
      icen = ibase;

      ij = 1+ibase;
      ijp = Nx+3+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

      ij = Nx+3+ibase;
      ijp = 2*Nx+5+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

      for (j=0; j<Ny-2; j++) {
        ij = j+2*Nx+5+ibase;
        ijp = ij+1;
	setIndex(bStart, ind, icen, ij, ijp);
      }

      ij = 2*Nx+Ny+3+ibase;
      ijp = Nx+4+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

      ij = Nx+4+ibase;
      ijp = 2+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

      // back edge (2Nx+Ny+4 ~ 2Nx+2Ny+2)
      ij = 2+ibase;
      ijp = 2*Nx+4+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

      ij = 2*Nx+4+ibase;
      ijp = 2*Nx+Ny+4+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

      for (j=0; j<Ny-2; j++) {
        ij = j+2*Nx+Ny+4+ibase;
        ijp = ij+1;
	setIndex(bStart, ind, icen, ij, ijp);
      }

      ij = 2*Nx+2*Ny+2+ibase;
      ijp = 3+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

      ij = 3+ibase;
      ijp = 1+ibase;
      setIndex(bStart, ind, icen, ij, ijp);

    }

    void setMsFlatCapVerts(int &ind, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS, bool bStart)
    {
      int j;
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

      // putty
      if (pRend->getPuttyMode()!=_Rend::TBR_PUTTY_OFF) {
        MolCoordPtr pCMol = pRend->getClientMol();
        Vector2D escl = pRend->getEScl(pCMol, pSeg, par);
        e1 = e1.scale(float(escl.x()));
        e2 = e2.scale(float(escl.y()));
      }

      e0 = e0.scale(sign);

      const int Nx = pTS->getMolScrNx();
      const int Ny = pTS->getMolScrNy();

      Vector3F f2 = (pTS->getVec(0, e1, e2) + pTS->getVec(Nx, e1, e2)).divide(2.0) + pos;
      Vector3F f3 = (pTS->getVec(Nx+Ny+2, e1, e2) + pTS->getVec(2*Nx+Ny+2, e1, e2)).divide(2.0) + pos;
      Vector3F gj;

      // center (0)
      m_pTarg->vertex3f(ind, pos);
      m_pTarg->normal3f(ind, e0);
      ++ind;

      // left center (1)
      m_pTarg->vertex3f(ind, f2);
      m_pTarg->normal3f(ind, e0);
      ++ind;

      // right center (2)
      m_pTarg->vertex3f(ind, f3);
      m_pTarg->normal3f(ind, e0);
      ++ind;

      // left circle (3 ~ Nx+3)
      for (j=0; j<=Nx; j++) {
        gj = pTS->getVec(j, e1, e2);
        m_pTarg->vertex3f(ind, gj+pos);
        m_pTarg->normal3f(ind, e0);
        ++ind;
      }
      
      // right circle (Nx+4 ~ 2Nx+4)
      for (j=0; j<=Nx; j++) {
        gj = pTS->getVec(j+Nx+Ny+2, e1, e2);
        m_pTarg->vertex3f(ind, gj+pos);
        m_pTarg->normal3f(ind, e0);
        ++ind;
      }

      // front edge (2Nx+5 ~ 2Nx+Ny+3)
      for (j=0; j<Ny-1; j++) {
        gj = pTS->getVec(j+Nx+2, e1, e2);
        m_pTarg->vertex3f(ind, gj+pos);
        m_pTarg->normal3f(ind, e0);
        ++ind;
      }

      // back edge (2Nx+Ny+4 ~ 2Nx+2Ny+2)
      for (j=0; j<Ny-1; j++) {
        gj = pTS->getVec(j+2*Nx+Ny+4, e1, e2);
        m_pTarg->vertex3f(ind, gj+pos);
        m_pTarg->normal3f(ind, e0);
        ++ind;
      }

      // total: 2(Nx+Ny)+3 = nSecDiv-1
    }

    void setMsFlatCapColors(int &ind, const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, bool bStart)
    {
      const int nSecDiv = m_nSecDiv;
      int j;
      float par;

      if (bStart)
        par = float(pDS->m_nStart);
      else
        par = float(pDS->m_nEnd);

      m_pTarg->color2(pSeg->calcColorPtr(pRend, pCMol, par), pRend->getSceneID());

      m_pTarg->color2(ind);
      ++ind;
      for (j=0; j<nSecDiv-1; ++j) {
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

      int nStCap = pRend->getCapTypeImpl(pSeg, pDS, true);
      int nEnCap = pRend->getCapTypeImpl(pSeg, pDS, false);

      if (nStCap==_Rend::CAP_SPHR) {
        makeSphrCapInd(ind, true);
      }
      else if (nStCap==_Rend::CAP_FLAT) {
        makeFlatCapInd(ind, true);
      }
      else if (nStCap==_Rend::XCAP_MSFLAT) {
        makeMsFlatCapInd(ind, true, pRend->getTubeSection());
      }

      if (nEnCap==_Rend::CAP_SPHR) {
        makeSphrCapInd(ind, false);
      }
      else if (nEnCap==_Rend::CAP_FLAT) {
        makeFlatCapInd(ind, false);
      }
      else if (nEnCap==_Rend::XCAP_MSFLAT) {
        makeMsFlatCapInd(ind, false, pRend->getTubeSection());
      }
    }

    void setVerts(_Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS)
    {
      int ind = 0;

      setBodyVerts(ind, pRend, pSeg, pDS, pTS);
      
      int nStCap = pRend->getCapTypeImpl(pSeg, pDS, true);
      int nEnCap = pRend->getCapTypeImpl(pSeg, pDS, false);

      if (nStCap==_Rend::CAP_SPHR) {
        setSphrCapVerts(ind, pRend, pSeg, pDS, pTS, true);
      }
      else if (nStCap==_Rend::CAP_FLAT) {
        setFlatCapVerts(ind, pRend, pSeg, pDS, pTS, true);
      }
      else if (nStCap==_Rend::XCAP_MSFLAT) {
        setMsFlatCapVerts(ind, pRend, pSeg, pDS, pTS, true);
      }

      if (nEnCap==_Rend::CAP_SPHR) {
        setSphrCapVerts(ind, pRend, pSeg, pDS, pTS, false);
      }
      else if (nEnCap==_Rend::CAP_FLAT) {
        setFlatCapVerts(ind, pRend, pSeg, pDS, pTS, false);
      }
      else if (nEnCap==_Rend::XCAP_MSFLAT) {
        setMsFlatCapVerts(ind, pRend, pSeg, pDS, pTS, false);
      }

    }
    
    void setColors(const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int ind = 0;

      setBodyColors(ind, pCMol, pRend, pSeg, pDS);
      
      int nStCap = pRend->getCapTypeImpl(pSeg, pDS, true);
      int nEnCap = pRend->getCapTypeImpl(pSeg, pDS, false);

      if (nStCap==_Rend::CAP_SPHR) {
        setSphrCapColors(ind, pCMol, pRend, pSeg, pDS, true);
      }
      else if (nStCap==_Rend::CAP_FLAT) {
        setFlatCapColors(ind, pCMol, pRend, pSeg, pDS, true);
      }
      else if (nStCap==_Rend::XCAP_MSFLAT) {
        setMsFlatCapColors(ind, pCMol, pRend, pSeg, pDS, true);
      }

      if (nEnCap==_Rend::CAP_SPHR) {
        setSphrCapColors(ind, pCMol, pRend, pSeg, pDS, false);
      }
      else if (nEnCap==_Rend::CAP_FLAT) {
        setFlatCapColors(ind, pCMol, pRend, pSeg, pDS, false);
      }
      else if (nEnCap==_Rend::XCAP_MSFLAT) {
        setMsFlatCapColors(ind, pCMol, pRend, pSeg, pDS, false);
      }

    }

  };

}

#endif

