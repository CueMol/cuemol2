// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: TgTorus.cpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#include <common.h>
#include "surface.hpp"

#ifdef SURF_BUILDER_TEST

#include <gfx/DisplayContext.hpp>
#include "MolSurfBuilder.hpp"

#include "TgTorus.hpp"
#include "RSComponent.hpp"
#include "SESTgBuilder.hpp"

using namespace surface;

TgTorus::TgTorus(SESTgBuilder *pprnt, const RSEdge *pEdge, double dden)
     : m_pParent(pprnt), m_pEdge(pEdge), m_dden(dden)
{
  m_pdl = m_pParent->m_pdl;
}

int TgTorus::calcTessLev(double theta, double rad, double density)
{
  const double arclen = qlib::abs(theta * rad);
  int ndiv = (int) ::ceil(arclen * density);
  if (ndiv<1)
    ndiv = 1;
  return ndiv;
}

void TgTorus::calc()
{
  if (m_pEdge->bRadSngl) {
    calcRadSngl();
    return;
  }

  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;

  int i, j;
  double th;

  const int iv1 = m_pEdge->idx[0];
  const int iv2 = m_pEdge->idx[1];
  const Vector4D &v1 = m_pEdge->param.a_i;
  const Vector4D &v2 = m_pEdge->param.a_j;
  MB_ASSERT(iv1==m_pEdge->param.aidx_i);
  MB_ASSERT(iv2==m_pEdge->param.aidx_j);
  const Vector4D &cen1 = m_pEdge->pF[0]->param.Pijk;
  const Vector4D &cen2 = m_pEdge->pF[1]->param.Pijk;

  const Vector4D &xtp = m_pEdge->param.Tij;
  const double &rtp = m_pEdge->param.rij;

  const Vector4D e12 = (v2-v1).normalize();
  const Vector4D ec1v1= (v1-cen1).normalize();
  const Vector4D ec1v2= (v2-cen1).normalize();

  MB_ASSERT(m_pEdge->pF[0]->pE[ m_pEdge->ford[0] ] == m_pEdge);
  MB_ASSERT(m_pEdge->pF[1]->pE[ m_pEdge->ford[1] ] == m_pEdge);

  int icce[4];
  SESArc *parc12 = m_pEdge->pF[0]->pArc[ m_pEdge->ford[0] ];
  SESArc *parc43 = m_pEdge->pF[1]->pArc[ m_pEdge->ford[1] ];
  
  SESArc *parc31 = m_pEdge->pArc[0];
  SESArc *parc24 = m_pEdge->pArc[1];

  icce[0] = parc12->m_idx0;
  icce[1] = parc12->m_idx1;
  icce[2] = parc43->m_idx1;
  icce[3] = parc43->m_idx0;

  //const Vector4D &cce1 = parc12->m_v0;
  //const Vector4D &cce2 = parc12->m_v1;
  //const Vector4D &cce3 = parc43->m_v1;
  //const Vector4D &cce4 = parc43->m_v0;
  //m_pdl->sphere(0.1, cce1);
  //m_pdl->sphere(0.2, cce2);
  //m_pdl->sphere(0.3, cce3);
  //m_pdl->sphere(0.4, cce4);
  //m_pdl->color_3d(1.0, 1.0, 0.0);
  //m_pdl->sphere(0.5, xtp);

  const double phi = parc12->m_th;
  const double theta = m_pEdge->param.phi_s;
  const double rcc1 = m_pEdge->param.rc_i;
  const double rcc2 = m_pEdge->param.rc_j;
  const double r_p = m_pEdge->param.r_p;

  // calc tessalation level
  const int npar = calcTessLev(phi, r_p, m_dden)+1;
  const int nver = calcTessLev(theta, qlib::max(rcc1, rcc2), m_dden)+1;
  //const int nver = calcTessLev(m_pEdge->theta, m_pEdge->rcc1, m_dden);
  //MB_DPRINTLN("===== Edge %p =====", m_pEdge);

  MB_DPRINTLN("Npar %d (phi %f, rad %f, arc %f)", npar,
              qlib::toDegree(phi), r_p, qlib::abs(phi*r_p));
  MB_DPRINTLN("Nver %d (the %f, rad %f, arc %f)", nver,
              qlib::toDegree(theta), rcc1, qlib::abs(theta*rcc1));

  // m_pdl->setLighting(false);

  // make template of cce1-cce2 edge
  std::vector<Vector4D> c12tmpl(npar);
  {
    // XXX: phi
    const double dth = phi/double(npar-1);
    
    for (th=0.0, i=0; i<npar; ++i) {
      c12tmpl[i] = Vector4D(r_p*::cos(th), r_p*::sin(th), 0.0);
      th += dth;
    }
  }

  // calc e1 and e2
  const Vector4D e1 = (ec1v1.cross(ec1v2)).normalize();
  const Vector4D e2 = ec1v1;
  std::vector<int> ixarray(npar*nver);
  {
    int iv;
    Vector4D acen;
    const Vector4D &te1 = e12;
    const Vector4D te2 = (cen1-xtp).normalize();

    const Matrix4D xfmat1 = Matrix4D::makeRotTranMat(te1, te2, xtp);
    const double dth = theta/double(nver-1);

    for (th=0.0, j=0; j<nver; ++j) {
      acen = Vector4D(rtp*::cos(th), rtp*::sin(th), 0.0);
      xfmat1.xform3D(acen);
      //m_pdl->vertex_v(acen);

      // rotate e1 e2
      const Matrix4D xfm2 = Matrix4D::makeRotMat(e12, -th);
      Vector4D re1 = e1;
      xfm2.xform3D(re1);
      Vector4D re2 = e2;
      xfm2.xform3D(re2);

      /*m_pdl->startLines();
      m_pdl->color_3d(1.0, double(i%2)/double(2), 0.0);
      m_pdl->vertex_v(acen);
      m_pdl->vertex_v(acen+re1);
      m_pdl->vertex_v(acen);
      m_pdl->vertex_v(acen+re2);
      m_pdl->end();*/

      // calc xform mat
      const Matrix4D xfmat2 = Matrix4D::makeRotTranMat(re1, re2, acen);

      // xfrom c12 template
      for (i=0; i<npar; ++i) {
        Vector4D vec = c12tmpl[i];
        xfmat2.xform3D(vec);
        Vector4D norm = (acen-vec).normalize();
        // m_pdl->vertex_v(vec);
        iv = -1;
        if (i==0&&j==0) {
          iv = icce[1-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce1);
        }
        else if (i==npar-1&&j==0) {
          iv = icce[2-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce2);
        }
        else if (i==0&&j==nver-1) {
          iv = icce[3-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce3);
        }
        else if (i==npar-1&&j==nver-1) {
          iv = icce[4-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce4);
        }

        if (iv<0)
          iv = tgset.addVertex(vec, norm);
        else
          tgset.setNorm(iv, norm);
        
        ixarray[i+j*npar] = iv;
      }

      th += dth;
    }
  }

  // build faces
  {
    //m_pdl->setLighting(true);
    //m_pdl->color_3d(0.0, 0.5, 0.5);
    //m_pdl->setPolygonMode(DisplayCommand::POLY_LINE);
    //m_pdl->setPolygonMode(DisplayCommand::POLY_FILL);
    //m_pdl->startTriangles();
    int iv1, iv2, iv3;
    //m_pdl->startLines();
    for (j=0; j<nver-1; ++j) {
      for (i=0; i<npar-1; ++i) {
        iv1 = ixarray[i+j*npar];
        iv2 = ixarray[i+1+(j+1)*npar];
        iv3 = ixarray[i+1+j*npar];
        tgset.addFace(iv1, iv2, iv3);

        /*
        m_pdl->normal_v(getTgNorm(iv1));
        m_pdl->vertex_v(getTgVertex(iv1));
        m_pdl->normal_v(getTgNorm(iv2));
        m_pdl->vertex_v(getTgVertex(iv2));
        m_pdl->normal_v(getTgNorm(iv3));
        m_pdl->vertex_v(getTgVertex(iv3));
         */
        iv1 = ixarray[i+j*npar];
        iv2 = ixarray[i+(j+1)*npar];
        iv3 = ixarray[i+1+(j+1)*npar];
        tgset.addFace(iv1, iv2, iv3);

        /*
        m_pdl->normal_v(getTgNorm(iv1));
        m_pdl->vertex_v(getTgVertex(iv1));
        m_pdl->normal_v(getTgNorm(iv2));
        m_pdl->vertex_v(getTgVertex(iv2));
        m_pdl->normal_v(getTgNorm(iv3));
        m_pdl->vertex_v(getTgVertex(iv3));
         */
      }
    }
    //m_pdl->end();
    //m_pdl->setLighting(false);
  }

  parc12->m_verts.resize(npar);
  parc43->m_verts.resize(npar);
  for (i=0; i<=npar-1; ++i) {
    parc12->m_verts[i] = ixarray[i];
    parc43->m_verts[i] = ixarray[(npar-1 - i) + (nver-1)*npar];
  }

  parc31->m_verts.resize(nver);
  parc24->m_verts.resize(nver);
  for (i=0; i<=nver-1; ++i) {
    parc31->m_verts[i] = ixarray[(nver-1 - i)*npar];
    parc24->m_verts[i] = ixarray[npar-1 + i*npar];
  }

}

/*
void TgTorus::calcRadSnglArc(SESArc *pArc,
                             const Vector4D &cen1, const Vector4D &cen2,
                             int ix1, int ix2, const SurfTgSet &sts)
{
}
*/

void TgTorus::calcRadSngl()
{
  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;

  int i, j;
  double th;

  MB_ASSERT(m_pEdge->pF[0]->pE[ m_pEdge->ford[0] ] == m_pEdge);
  MB_ASSERT(m_pEdge->pF[1]->pE[ m_pEdge->ford[1] ] == m_pEdge);

  SESArc *parc12 = m_pEdge->pF[0]->pArc[ m_pEdge->ford[0] ];
  SESArc *parc43 = m_pEdge->pF[1]->pArc[ m_pEdge->ford[1] ];
  SESArc *parc31 = m_pEdge->pArc[0];
  SESArc *parc24 = m_pEdge->pArc[1];

  parc12->m_bRadSngl = true;
  parc43->m_bRadSngl = true;

  const int iv1 = m_pEdge->idx[0];
  const int iv2 = m_pEdge->idx[1];
  const Vector4D &v1 = m_pEdge->param.a_i;
  const Vector4D &v2 = m_pEdge->param.a_j;
  MB_ASSERT(iv1==m_pEdge->param.aidx_i);
  MB_ASSERT(iv2==m_pEdge->param.aidx_j);
  const Vector4D &cen1 = m_pEdge->pF[0]->param.Pijk;
  const Vector4D &cen2 = m_pEdge->pF[1]->param.Pijk;

  const Vector4D &xtp = m_pEdge->param.Tij;
  const double &rtp = m_pEdge->param.rij;
  const double &r_p = m_pEdge->param.r_p;

  const Vector4D e12 = (v2-v1).normalize();
  const Vector4D ec1v1= (v1-cen1).normalize();
  const Vector4D ec1v2= (v2-cen1).normalize();

  const double dsp_ij = ::sqrt(r_p*r_p - rtp*rtp);
  const Vector4D sp_i = xtp - e12.scale(dsp_ij);
  const Vector4D sp_j = xtp + e12.scale(dsp_ij);

  const double phi = parc12->m_th;
  const double theta = m_pEdge->param.phi_s;
  const double rcc1 = m_pEdge->param.rc_i;
  const double rcc2 = m_pEdge->param.rc_j;

  const Vector4D &cce1 = parc12->m_v0;
  const Vector4D &cce2 = parc12->m_v1;
  const Vector4D &cce3 = parc43->m_v1;
  const Vector4D &cce4 = parc43->m_v0;
  
  const double phi_i = (cce1-cen1).angle(sp_i-cen1);
  const double phi_j = (cce2-cen1).angle(sp_j-cen1);

  // calc tessalation level
  const int npar_i = calcTessLev(phi_i, r_p, m_dden)+1;
  const int npar_j = calcTessLev(phi_j, r_p, m_dden)+1;
  const int npar = npar_i + npar_j;
  const int nver = calcTessLev(theta, qlib::max(rcc1, rcc2), m_dden)+1;

  MB_DPRINTLN("Npar_i %d (phi_i %f, rad %f, arc %f)", npar_i,
              qlib::toDegree(phi_i), r_p, qlib::abs(phi_i*r_p));
  MB_DPRINTLN("Npar_j %d (phi_j %f, rad %f, arc %f)", npar_j,
              qlib::toDegree(phi_j), r_p, qlib::abs(phi_j*r_p));
  MB_DPRINTLN("Nver %d (the %f, rad %f, arc %f)", nver,
              qlib::toDegree(theta), rcc1, qlib::abs(theta*rcc1));

  //m_pdl->sphere(0.1, cce1);
  //m_pdl->sphere(0.2, cce2);
  //m_pdl->sphere(0.3, cce3);
  //m_pdl->sphere(0.4, cce4);
  //m_pdl->color_3d(1.0, 1.0, 0.0);
  //m_pdl->sphere(0.5, xtp);

  // make template of the "discontinuous" cce1-cce2 edge
  std::vector<Vector4D> c12tmpl(npar);
  {
    const double dth_i = phi_i/double(npar_i-1);
    const double dth_j = phi_j/double(npar_j-1);
    
    for (th=0.0, i=0; i<npar_i; ++i) {
      c12tmpl[i] = Vector4D(r_p*::cos(th), r_p*::sin(th), 0.0);
      th += dth_i;
    }

    th = phi - phi_j;
    for (; i<npar; ++i) {
      c12tmpl[i] = Vector4D(r_p*::cos(th), r_p*::sin(th), 0.0);
      th += dth_j;
    }
  }

  int icce[4];
  icce[0] = parc12->m_idx0;
  icce[1] = parc12->m_idx1;
  icce[2] = parc43->m_idx1;
  icce[3] = parc43->m_idx0;

  // calc e1 and e2
  const Vector4D e1 = (ec1v1.cross(ec1v2)).normalize();
  const Vector4D e2 = ec1v1;
  std::vector<int> ixarray(npar*nver);
  {
    int iv;
    Vector4D acen;
    const Vector4D &te1 = e12;
    const Vector4D te2 = (cen1-xtp).normalize();

    const Matrix4D xfmat1 = Matrix4D::makeRotTranMat(te1, te2, xtp);
    const double dth = theta/double(nver-1);

    for (th=0.0, j=0; j<nver; ++j) {
      acen = Vector4D(rtp*::cos(th), rtp*::sin(th), 0.0);
      xfmat1.xform3D(acen);
      //m_pdl->vertex_v(acen);

      // rotate e1 e2
      const Matrix4D xfm2 = Matrix4D::makeRotMat(e12, -th);
      Vector4D re1 = e1;
      xfm2.xform3D(re1);
      Vector4D re2 = e2;
      xfm2.xform3D(re2);

      /*m_pdl->startLines();
      m_pdl->color_3d(1.0, double(i%2)/double(2), 0.0);
      m_pdl->vertex_v(acen);
      m_pdl->vertex_v(acen+re1);
      m_pdl->vertex_v(acen);
      m_pdl->vertex_v(acen+re2);
      m_pdl->end();*/

      // calc xform mat
      const Matrix4D xfmat2 = Matrix4D::makeRotTranMat(re1, re2, acen);

      // xfrom c12 template
      for (i=0; i<npar; ++i) {
        Vector4D vec = c12tmpl[i];
        xfmat2.xform3D(vec);
        Vector4D norm = (acen-vec).normalize();
        // m_pdl->vertex_v(vec);
        iv = -1;
        if (i==0&&j==0) {
          iv = icce[1-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce1);
        }
        else if (i==npar-1&&j==0) {
          iv = icce[2-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce2);
        }
        else if (i==0&&j==nver-1) {
          iv = icce[3-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce3);
        }
        else if (i==npar-1&&j==nver-1) {
          iv = icce[4-1];
          //if (iv<0)
          //m_pdl->sphere(0.1, cce4);
        }

        if (iv<0)
          iv = tgset.addVertex(vec, norm);
        else
          tgset.setNorm(iv, norm);
        
        ixarray[i+j*npar] = iv;
      }

      th += dth;
    }
  }

  // build faces
  {
    int iv1, iv2, iv3;

    for (j=0; j<nver-1; ++j) {
      for (i=0; i<npar_i-1; ++i) {
        iv1 = ixarray[i+j*npar];
        iv2 = ixarray[i+1+(j+1)*npar];
        iv3 = ixarray[i+1+j*npar];
        if ((i+1)!=npar_i-1)
          tgset.addFace(iv1, iv2, iv3);

        iv1 = ixarray[i+j*npar];
        iv2 = ixarray[i+(j+1)*npar];
        iv3 = ixarray[i+1+(j+1)*npar];
        tgset.addFace(iv1, iv2, iv3);

      }
      for (i=npar_i; i<npar-1; ++i) {
        iv1 = ixarray[i+j*npar];
        iv2 = ixarray[i+1+(j+1)*npar];
        iv3 = ixarray[i+1+j*npar];
        tgset.addFace(iv1, iv2, iv3);

        iv1 = ixarray[i+j*npar];
        iv2 = ixarray[i+(j+1)*npar];
        iv3 = ixarray[i+1+(j+1)*npar];
        if (i!=npar_i)
          tgset.addFace(iv1, iv2, iv3);

      }
    }
  }

  // TO DO: singular edge
  {
    const Vector4D cin = (cen1+cen2).scale(0.5);
    const int ix1 = ixarray[npar_i-1];
    const int ix2 = ixarray[npar_i];
    // const double psi = (sp_i - cin).angle(sp_j - cin);

    if (theta<M_PI) {

      parc12->m_pSnglArc = MB_NEW SESArc;
      parc12->m_pSnglArc->setup(cin, ix1, ix2, tgset);
      parc12->m_pSnglArc->makeVerteces(tgset, cen1, m_dden);
      parc12->m_nSngSpi = npar_i-1;

      parc43->m_pSnglArc = MB_NEW SESArc;
      parc43->m_pSnglArc->setup(cin, ix2, ix1, tgset);
      parc43->m_pSnglArc->makeVerteces(tgset, cen2, m_dden);
      parc43->m_nSngSpi = npar-1 - (npar_i);
    }
    else {
      /*
      parc12->m_pSnglArc = MB_NEW SESArc;
      parc43->m_pSnglArc = MB_NEW SESArc;

      parc12->m_pSnglArc->setup(cin, ix1, ix2, tgset);
      parc12->m_pSnglArc->m_norm = -parc12->m_pSnglArc->m_norm;
      parc12->m_pSnglArc->m_th = 2.0*M_PI-parc12->m_pSnglArc->m_th;

      parc43->m_pSnglArc->setup(cin, ix2, ix1, tgset);
      parc43->m_pSnglArc->m_norm = -parc43->m_pSnglArc->m_norm;
      parc43->m_pSnglArc->m_th = 2.0*M_PI-parc43->m_pSnglArc->m_th;
       */
    }
  }

  // Setup SESArc's vertex data structure (for the sphere tesselation later)
  parc12->m_verts.resize(npar);
  parc43->m_verts.resize(npar);
  for (i=0; i<=npar-1; ++i) {
    parc12->m_verts[i] = ixarray[i];
    parc43->m_verts[i] = ixarray[(npar-1 - i) + (nver-1)*npar];
  }

  parc31->m_verts.resize(nver);
  parc24->m_verts.resize(nver);
  for (i=0; i<=nver-1; ++i) {
    parc31->m_verts[i] = ixarray[(nver-1 - i)*npar];
    parc24->m_verts[i] = ixarray[npar-1 + i*npar];
  }
}

#endif

