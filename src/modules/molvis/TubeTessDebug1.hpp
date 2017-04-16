// -*-Mode: C++;-*-
//
//  Tube tesselation class (debug)
//

#ifndef TUBE_TESS_DEBUG1_HPP_INCLUDED
#define TUBE_TESS_DEBUG1_HPP_INCLUDED

namespace molvis {

  using qlib::Vector2D;
  template <class _Rend, class _Seg=typename _Rend::SplSeg, class _DrawSeg=typename _Rend::DrawSeg, class _VertArray=typename _DrawSeg::VertArray>
  class TubeTestTess
  {
  public:
    TubeTestTess() {}

    int m_nbody_verts;
    int m_nbody_faces;

    int m_nVerts;
    int m_nFaces;

    int m_nAxPts;
    int m_nSecDiv;

    _VertArray *m_pTarg;

    _VertArray *getTarget() const {
      return m_pTarg;
    }
    void setTarget(_VertArray *pTarg) {
      m_pTarg = pTarg;
    }

    void calcSize( _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS,
                   int &rnvert, int &rnface)
    {
      TubeSectionPtr pTS = pRend->getTubeSection();
      const int nDetail = pRend->getAxialDetail();
      const int nSecDiv = pTS->getSize();

      const int nsplseg = pDS->m_nEnd - pDS->m_nStart;
      const int nAxPts = nDetail * nsplseg + 1;
      pDS->m_nAxPts = nAxPts;

      m_nSecDiv = nSecDiv;
      m_nAxPts = nAxPts;

      const int nSphr = nSecDiv/2;

      const float fDetail = float(nDetail);
      const float fStart = float(pDS->m_nStart);

      m_nbody_verts = nAxPts * nSecDiv * 2;
      m_nbody_faces = nAxPts * nSecDiv * 2 / 3 + 3;
      //m_nbody_faces = nSecDiv * (nAxPts-1) * 2;

      rnvert = m_nVerts = m_nbody_verts;
      rnface = m_nFaces = m_nbody_faces;
    }

    /// Generate body indices
    void makeIndex(_Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int ind = 0;

      const int nDetail = pRend->getAxialDetail();
      const int iGap = int( floorf(float(nDetail)/2.0f) );

      //_VertArray *pVBO = m_pTarg;
      int i, j;
      int ij, ijp, ipj, ipjp;
      int irow;

      for (i=0; i<m_nAxPts; ++i) {
        irow = i*m_nSecDiv;
        for (j=0; j<m_nSecDiv; ++j) {
          m_pTarg->setIndex(ind, (irow+j)*2);
          ++ind;
          m_pTarg->setIndex(ind, (irow+j)*2 + 1);
          ++ind;
        }
      }
    }



    void setVerts(_Rend *pRend, _Seg *pSeg, _DrawSeg *pDS, TubeSection *pTS)
    {
      int ind = 0;

      int i, j;

      const int nDetail = pRend->getAxialDetail();
      const float fDetail = float(nDetail);
      const float fStart = float(pDS->m_nStart);
      const int nAxPts = pDS->m_nAxPts;
      const int nSecDiv = m_nSecDiv; //pTS->getSize();

      Vector3F f, e0, e1, e2;
      Vector3F g, dg;

      // putty
      MolCoordPtr pCMol;
      Vector2D escl(1,1);
      bool bPutty = false;
      if (pRend->getPuttyMode()!=_Rend::TBR_PUTTY_OFF) {
        bPutty = true;
        pCMol = pRend->getClientMol();
      }

      const float width1 = pTS->getWidth();
      const float width2 = pTS->getWidth()*pTS->getTuber();

      for (i=0; i<m_nAxPts; ++i) {
        const float s = float(i)/fDetail + fStart;

        //pSeg->getBasisVecs(par, pos, e0, e1, e2);

        Vector3F f, v0, dv0;
        CubicSpline *pAxInt = pSeg->getAxisIntpol();
        {
          Vector4D d1, d2, d3;
          pAxInt->interpolate(s, &d1, &d2, &d3);
          f = Vector3F(d1.x(), d1.y(), d1.z());
          v0 = Vector3F(d2.x(), d2.y(), d2.z());
          dv0 = Vector3F(d3.x(), d3.y(), d3.z());
        }

        float v0len = v0.length();
        Vector3F e0 = v0.divide(v0len);

        Vector3F v2, dv2;
        {
          pSeg->intpolLinBn(s, &v2, &dv2);
        }

        float v2len = v2.length();
        Vector3F e2 = v2.divide(v2len);

        Vector3F e1 = e2.cross(e0);

        Vector2D escl(1.0, 1.0), descl(0.0, 0.0);
        if (bPutty)
          escl = pRend->getEScl(pCMol, pSeg, s);

        for (j=0; j<nSecDiv; ++j) {
          const float t = float(j)/float(nSecDiv);
          float th = t * M_PI * 2.0f;
          //float th = st.t;
          float si = sin(th);
          float co = cos(th);
          
          float cow = co*width1;
          float siw = si*width2;
          
          Vector3F pos = f + e1.scale(cow*escl.x()) + e2.scale(siw*escl.y());

          Vector3F pos_dt = e1.scale(-si*width1*escl.x()) + e2.scale(co*width2*escl.y());

          // s derivative of e0 (=v0/|v0|)
          Vector3F de0 = v0.cross( dv0.cross(v0) ).divide(v0len*v0len*v0len);
          // s derivative of e2 (=v2/|v2|)
          Vector3F de2 = v2.cross( dv2.cross(v2) ).divide(v2len*v2len*v2len);
          // s derivative of e1 (cross(e2, e0))
          Vector3F de1 = de2.cross(e0) + e2.cross(de0);

          Vector3F pos_ds = v0 +
            //cow*( de1*escl.x) + siw*( de2*escl.y );
            ( e1.scale(descl.x()) + de1.scale(escl.x())).scale(cow) +
              ( e2.scale(descl.y()) + de2.scale(escl.y()) ).scale(siw);

          Vector3F dg = pos_dt.cross(pos_ds).normalize();

          m_pTarg->vertex3f(ind, pos);
          ++ind;
          m_pTarg->vertex3f(ind, pos + dg.scale(0.5));
          ++ind;


          /*
          const Vector4D &stab = pTS->getSectTab(j);
          g = e1.scale( float(stab.x() * escl.x()) ) + e2.scale( float(stab.y() * escl.y()) );
          dg = e1.scale( float(stab.z()) ) + e2.scale( float(stab.w()) );
          m_pTarg->vertex3f(ind, pos + g);
          ++ind;
          m_pTarg->vertex3f(ind, pos + g + dg.scale(0.5));
          ++ind;
           */
        }
      }
    }
    
    /// Set body colors
    void setColors(const MolCoordPtr &pCMol, _Rend *pRend, _Seg *pSeg, _DrawSeg *pDS)
    {
      int ind = 0;

      int i, j;
      float par;

      const int nDetail = pRend->getAxialDetail();
      const float fDetail = float(nDetail);
      const float fStart = float(pDS->m_nStart);

      for (i=0; i<m_nAxPts; ++i) {
        par = float(i)/fDetail + fStart;
	
        //MB_DPRINTLN("set vertcol i=%d, k=%d", i, k);
        m_pTarg->color2(pSeg->calcColorPtr(pRend, pCMol, par), pRend->getSceneID());
        for (j=0; j<m_nSecDiv; ++j) {
          m_pTarg->color2(ind);
          ++ind;
        }
      }
    }

  };

}

#endif

