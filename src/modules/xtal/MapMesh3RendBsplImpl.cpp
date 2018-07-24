// -*-Mode: C++;-*-
//
// Generate/Render mesh contours of ScalarObject (ver. 3)
//

#include <common.h>

#include "MapMesh3Renderer.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>

#include <cfloat>

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;

Vector3F MapMesh3Renderer::getXValF(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev)
{
  if (qlib::isNear(val0,val1))
    return vec0;
  //return -1.0;

  float crs = (isolev-val0)/(val1-val0);
  //return crs;

  return vec0 + (vec1-vec0).scale(crs);
}

class DivideDraw
{
public:
  float m_r;
  int m_ipln;
  MapBsplIpol *m_pipol;
  Vector3F m_v0;
  float m_isolev;
  float m_eps;

  inline bool isNear(float f0, float f1) const {
    float del = qlib::abs(f0-f1);
    if (del<m_eps)
      return true;
    else
      return false;
  }

  Vector3F getVth(float th) const
  {
    if (m_ipln==0)
      return Vector3F(m_r*cos(th), m_r*sin(th), 0.0f);
    else if (m_ipln==1)
      return Vector3F(0.0f, m_r*cos(th), m_r*sin(th));
    else /*if (m_ipln==2)*/
      return Vector3F(m_r*sin(th), 0.0f, m_r*cos(th));
  }

  Vector3F getDvth(float th) const
  {
    if (m_ipln==0)
      return Vector3F(-m_r*sin(th), m_r*cos(th), 0.0f);
    else if (m_ipln==1)
      return Vector3F(0.0f, -m_r*sin(th), m_r*cos(th));
    else /*if (m_ipln==2)*/
      return Vector3F(m_r*cos(th), 0.0f, -m_r*sin(th));
    //return vth;
  }

  inline Vector3F getV(float th) const
  {
    return m_v0 + getVth(th);
  }

  inline float getF(float th) const
  {
    return m_pipol->calcAt(getV(th)) - m_isolev;
  }

  bool findRootNrImpl2(float thM, float &rval, bool bnorm = true)
  {
    int i, j;
    float fth, dfth, mu;
    Vector3F vth, dfdv, dvdth;

    // initial estimate: thM
    float th = thM;

    bool bConv = false;
    for (i=0; i<10; ++i) {
      vth = getV(th);
      fth = m_pipol->calcAt(vth)-m_isolev;
      if (isNear(fth, 0.0f)) {
        bConv = true;
        break;
      }

      dfdv = m_pipol->calcDiffAt(vth);
      dvdth = getDvth(th);
      dfth = dvdth.dot( dfdv );

      mu = 1.0f;

      for (j=0; j<10; ++j) {
        float ftest1 = qlib::abs( getF(th - (fth/dfth) * mu) );
        float ftest2 = (1.0f-mu/4.0f) * qlib::abs(fth);
        if (ftest1<ftest2)
          break;
        mu = mu * 0.5f;
      }

      if (j == 10) {
        // cannot determine dumping factor mu
        //  --> does not use dumping
        mu = 1.0f;
      }

      th += -(fth/dfth) * mu;

      if (bnorm)
        th = fmodf(th, 2.0*M_PI);
    }

    rval = th;
    return bConv;
  }

  /// Find root restricted between thL and thU (by Newton/Bisec hybrid method)
  bool findRootNrRestrImpl1(float thL, float thU, float &rval)
  {
    float thM = (thL+thU)*0.5f;

    float th; // = 0.0f;
    bool res;

    for (int i=0; i<10; ++i) {
      res = findRootNrImpl2(thM, th, false);
      if (res) {
        //rval = getV(th);
        if (thL<=th && th<=thU) {
          rval = th;
          return true;
        }
        else {
          //MB_DPRINTLN("solution out of range --> retry");
        }
      }

      float fthL = getF(thL);
      float fthU = getF(thU);
      float fthM = getF(thM);

      if (fthL*fthM<0 && fthU*fthM>0) {
        // find between thL & thM
        thU = thM;
      }
      else if (fthL*fthM>0 && fthU*fthM<0) {
        // find between thM & thU
        thL = thM;
      }
      else {
        MB_DPRINTLN("solution is not between thL and thU --> ERROR!!");
        return false;
      }

      thM = (thL + thU)*0.5f;
    }

    // ERROR!! not converged
    return false;
  }


  //////////

  bool findPlusMinus(float sol1, float &del)
  {
    int i;

    del = 0.1;
    for (i=0; i<100; ++i) {
      if (getF(sol1-del) * getF(sol1+del) < 0.0f) {
        return true;
      }
      del *= 0.5f;
      // XXX ???
      if (del<m_eps)
        break;
    }

    // ERROR?? (or degenerated solution)
    MB_DPRINTLN("ERROR, thL/thU for root2 not found.");
    for (i=0; i<100; ++i) {
      float th = i* (2.0*M_PI/100.0);
      MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
    }

    return false;
  }

  bool findBothRoot(float &sol1, float &sol2)
  {
    int i;
    float th, thU, thL, rval;

    bool res;

    thL = 0.0f;
    thU = 2.0 * M_PI;
    th = (thL+thU) * 0.5f;
    res = findRootNrImpl2(th, rval);

    if (!res) {
      // ERROR??
      MB_DPRINTLN("ERROR, root1 not found.");
      for (i=0; i<100; ++i) {
        th = i* (2.0*M_PI/100.0);
        MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
      }

      th = (thL+thU) * 0.5f;
      findRootNrImpl2(th, rval);

      return false;
    }

    sol1 = rval;

    float del;
    if (!findPlusMinus(sol1, del)) {
      return false;
    }

    thU = sol1-del;
    thL = sol1+del - 2.0*M_PI;
    res = findRootNrRestrImpl1(thL, thU, rval);

    if (!res) {
      // ERROR??
      MB_DPRINTLN("ERROR, root2 not found.");
      for (i=0; i<100; ++i) {
        th = i* (2.0*M_PI/100.0);
        MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
      }

      res = findRootNrRestrImpl1(thU, thL, rval);
      return false;
    }

    sol2 = rval;
    return true;
  }


  bool findAnotherRoot(float sol1, float &sol2)
  {
    int i;
    float th, thU, thL, rval;

    bool res;

    float del;
    if (!findPlusMinus(sol1, del)) {
      return false;
    }

    thU = sol1-del;
    thL = sol1+del - 2.0*M_PI;
    res = findRootNrRestrImpl1(thL, thU, rval);

    if (!res) {
      // ERROR??
      MB_DPRINTLN("ERROR, root2 not found.");
      for (i=0; i<100; ++i) {
        th = i* (2.0*M_PI/100.0);
        MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
      }

      res = findRootNrRestrImpl1(thU, thL, rval);
      return false;
    }

    sol2 = rval;
    return true;
  }
};


void MapMesh3Renderer::divideDraw2(DisplayContext *pdl,
                                   const Vector3F &v0, const Vector3F &v1, const Vector3F &vm,
                                   int ipln)
{
  DivideDraw dd;

  dd.m_r = m_dArcMax;
  dd.m_ipln = ipln;
  dd.m_isolev = m_isolev;
  dd.m_pipol = &m_ipol;
  dd.m_eps = FLT_EPSILON*100.0f;

  const int ndiv = 8;

  float sol[2];
  float th, prev_th;
  Vector3F vi;

  dd.m_v0 = vm;
  if (!dd.findBothRoot(sol[0], sol[1])) {
    MB_DPRINTLN("divideDraw2> findBothRoot failed!!");
    return;
  }

  const int ntry = int( (v0-v1).length()/m_dArcMax ) * 1;

  bool bV0_OK = false;
  bool bV1_OK = false;
  for (int j=0; j<2; ++j) {

    std::vector<Vector3F> verts;

    //verts.push_back(vm);

    dd.m_v0 = vm;
    prev_th = sol[j];
    vi = dd.getV(prev_th);
    verts.push_back(vi);
    //pdl->vertex(vm.x(), vm.y(), vm.z());
    //pdl->vertex(vi.x(), vi.y(), vi.z());
    //pdl->vertex(vi.x(), vi.y(), vi.z());

    float fsol;
    bool bOK = false;
    bool bV1;
    for (int i=0; i<ntry; i++) {
      if ((vi-v1).length()<m_dArcMax) {
        bOK = true;
        bV1 = true;
        break;
      }
      if ((vi-v0).length()<m_dArcMax) {
        bOK = true;
        bV1 = false;
        break;
      }

      dd.m_v0 = vi;
      if (!dd.findAnotherRoot(prev_th-M_PI, fsol)) {
        break;
      }
      prev_th = fsol;
      vi = dd.getV(prev_th);
      verts.push_back(vi);
      //pdl->vertex(vi.x(), vi.y(), vi.z());
      //pdl->vertex(vi.x(), vi.y(), vi.z());
    }

    if (bOK) {
      if (bV1) {
        verts.push_back(v1);
        //pdl->vertex(v1.x(), v1.y(), v1.z());
        bV1_OK = true;
      }
      else {
        verts.push_back(v0);
        //pdl->vertex(v0.x(), v0.y(), v0.z());
        bV0_OK = true;
      }

      Vector3F prev = vm;
      BOOST_FOREACH (const Vector3F &v, verts) {
        pdl->vertex(prev.x(), prev.y(), prev.z());
        pdl->vertex(v.x(), v.y(), v.z());
        prev = v;
      }
    }
  }

  if (bV0_OK && !bV1_OK) {
    pdl->vertex(vm.x(), vm.y(), vm.z());
    pdl->vertex(v1.x(), v1.y(), v1.z());
  }
  else if (!bV0_OK && bV1_OK) {
    pdl->vertex(vm.x(), vm.y(), vm.z());
    pdl->vertex(v0.x(), v0.y(), v0.z());
  }
  else if (!bV1_OK && !bV1_OK) {
    pdl->vertex(v0.x(), v0.y(), v0.z());
    pdl->vertex(v1.x(), v1.y(), v1.z());
  }
}

class DivideDrawLine
{
public:
  int m_ipln;
  Vector3F m_pln;
  MapBsplIpol *m_pipol;
  float m_isolev;
  float m_eps;

  Vector3F m_v0, m_dv, m_vn, m_vm;
  float m_xi;
  // float m_rho;

  inline bool isNear(float f0, float f1) const {
    float del = qlib::abs(f0-f1);
    if (del<m_eps)
      return true;
    else
      return false;
  }

  inline Vector3F getV(float rho) const
  {
    return m_vm + m_vn.scale(rho);
  }

  inline float getF(float rho) const
  {
    return m_pipol->calcAt(getV(rho)) - m_isolev;
  }

  inline float getDF(float rho) const
  {
    Vector3F dfdv = m_pipol->calcDiffAt(getV(rho));
    return m_vn.dot( dfdv );
  }

  void setup(const Vector3F &v0, const Vector3F &v1, float xi, int ipln)
  {
    m_ipln = ipln;
    if (ipln==0)
      m_pln = Vector3F(0,0,1);
    else if (ipln==1)
      m_pln = Vector3F(1,0,0);
    else /*if (ipln==2)*/
      m_pln = Vector3F(0,1,0);

    m_v0 = v0;
    m_dv = v1-v0;
    m_xi = xi;
    m_vm = v0 + m_dv.scale(xi);
    m_vn = m_dv.cross(m_pln);
  }

  /*
  bool findPlusMinus(float &rval0, float &rval1)
  {
    float rho = 0.0f;
    float Frho;
    float dvlen = m_dv.length() * 0.1f;

    int i, j;

    for (i=1; i<100; ++i) {
      Frho = getF(rho);
      if (qlib::abs(Frho)>m_eps*10.0f)
        break;
      rho += dvlen * float(i*i);
      //rho += 0.1;
    }

    rval0 = rho;

    if (i==100) {
      MB_DPRINTLN("findPlusMinus> line search for |F(rho)|>dtol failed.");
    }

    float del;
    if (i>1)
      del = rho*2.0f;
    else
      del = dvlen;

    float rhop, Fp;

    for (j=1; j<10; ++j) {
      rhop = rho + del * float(j*j);
      Fp = getF(rhop);
      if (Frho*Fp<0.0) {
        rval1 = rhop;
        return true;
      }

      rhop = rho - del * float(j*j);
      Fp = getF(rhop);
      if (Frho*Fp<0.0) {
        rval1 = rhop;
        return true;
      }
    }

    return false;
  }
   */

  bool findRootNrImpl2(float rhoM, float &rval, bool bdump = true)
  {
    int i, j;
    float Frho, dFrho, mu;

    // initial estimate: rhoM
    float rho = rhoM;

    bool bConv = false;
    for (i=0; i<10; ++i) {
      Frho = getF(rho);
      if (isNear(Frho, 0.0f)) {
        bConv = true;
        break;
      }

      dFrho = getDF(rho);

      mu = 1.0f;

      if (bdump) {
        for (j=0; j<10; ++j) {
          float ftest1 = qlib::abs( getF(rho - (Frho/dFrho) * mu) );
          float ftest2 = (1.0f-mu/4.0f) * qlib::abs(Frho);
          if (ftest1<ftest2)
            break;
          mu = mu * 0.5f;
        }
        if (j == 10) {
          // cannot determine dumping factor mu
          //  --> does not use dumping
          mu = 1.0f;
        }
      }


      rho += -(Frho/dFrho) * mu;
    }

    rval = rho;
    return bConv;
  }

  /*
  /// Find root restricted between rhoL and rhoU (by Newton/Bisec hybrid method)
  bool findRootNrRestr1(float rhoL, float rhoU, float &rval)
  {
    float rhoM = (rhoL+rhoU)*0.5f;

    float rho; // = 0.0f;
    bool res;

    for (int i=0; i<10; ++i) {
      res = findRootNrImpl2(rhoM, rho, true);
      if (res) {
        if (rhoL<=rho && rho<=rhoU) {
          rval = rho;
          return true;
        }
        else {
          //MB_DPRINTLN("solution out of range --> retry");
        }
      }

      float fL = getF(rhoL);
      float fU = getF(rhoU);
      float fM = getF(rhoM);

      if (fL*fM<0 && fU*fM>0) {
        // find between rhoL & rhoM
        rhoU = rhoM;
      }
      else if (fL*fM>0 && fU*fM<0) {
        // find between rhoM & rhoU
        rhoL = rhoM;
      }
      else {
        MB_DPRINTLN("solution is not between thL and thU --> ERROR!!");
        return false;
      }

      rhoM = (rhoL + rhoU)*0.5f;
    }

    // ERROR!! not converged
    return false;
  }
   */
};

void MapMesh3Renderer::divideAndDraw(DisplayContext *pdl,
                                     const Vector3F &v0, const Vector3F &v1,
                                     int ipln)
{
  DivideDrawLine dd;
  dd.m_isolev = m_isolev;
  dd.m_eps = FLT_EPSILON*100.0f;
  dd.m_pipol = &m_ipol;

  float xi0 = 0.5f;
  Vector3F vrho;

  const float maxlen = 1.0f;
  float xi = xi0;
  float rho;
  int i;

  for (i=0; i<10; ++i) {
    dd.setup(v0, v1, xi, ipln);
    if ((dd.m_vm-v0).length()<m_dArcMax) {
      //MB_DPRINTLN("searc in xi direction failed");
      break;
    }

    if (dd.findRootNrImpl2(0.0f, rho, true)) {
      vrho = dd.m_vm + dd.m_vn.scale(rho);
      if ((vrho-v0).length()<maxlen ||
          (vrho-v1).length()<maxlen) {
        divideDraw2(pdl, v0, v1, vrho, ipln);
        return;
      }
    }

    xi *= 0.5f;
  }

  xi = (xi0 + 1.0f)*0.5f;
  for (i=0; i<10; ++i) {
    dd.setup(v0, v1, xi, ipln);
    if ((dd.m_vm-v1).length()<m_dArcMax) {
      break;
    }

    if (dd.findRootNrImpl2(0.0f, rho, true)) {
      vrho = dd.m_vm + dd.m_vn.scale(rho);
      if ((vrho-v0).length()<maxlen ||
          (vrho-v1).length()<maxlen) {
        divideDraw2(pdl, v0, v1, vrho, ipln);
        return;
      }
    }

    xi = (xi + 1.0f)*0.5f;
  }

  //MB_DPRINTLN("searc in xi direction failed");

  pdl->vertex(v0.x(), v0.y(), v0.z());
  pdl->vertex(v1.x(), v1.y(), v1.z());

  return;

}

/// File rendering/Generate display list (legacy interface)
void MapMesh3Renderer::renderImplTest2(DisplayContext *pdl)
{
  // TO DO: support object xformMat property!!

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  calcMapDispExtent(pMap);
  calcContLevel(pMap);

  // setup mol boundry info (if needed)
  setupMolBndry();

  const int ncol = m_dspSize.x();
  const int nrow = m_dspSize.y();
  const int nsec = m_dspSize.z();

  const int stcol = m_mapStPos.x();
  const int strow = m_mapStPos.y();
  const int stsec = m_mapStPos.z();

  const int na = pXtal->getColNo();
  const int nb = pXtal->getRowNo();
  const int nc = pXtal->getSecNo();

  int i, j, k;

  if (m_ipol.m_pBsplCoeff==NULL)
    m_ipol.calcCoeffs(pXtal);

  pdl->pushMatrix();
  setupXform(pdl, pMap, pXtal, false);

  float val[4];
  Vector3F vec[4];
  float isolev = float( pMap->getRmsdDensity() * getSigLevel() );
  m_isolev = isolev;

  MapCrossValSolver xsol;
  xsol.m_pipol = &m_ipol;
  xsol.m_isolev = isolev;
  xsol.m_eps = FLT_EPSILON*100.0f;

  pdl->color(getDefaultColor());
  pdl->startLines();

  // plane normal vector;
  Vector3F pln;

  int ii;

  for (k=0; k<nsec-1; k++)
    for (j=0; j<nrow-1; j++)
      for (i=0; i<ncol-1; i++){
        for (int iplane = 0; iplane<3; ++iplane) {
          //for (int iplane = 2; iplane<3; ++iplane) {
          if (iplane==0)
            pln = Vector3F(0,0,1);
          else if (iplane==1)
            pln = Vector3F(1,0,0);
          else
            pln = Vector3F(0,1,0);

          quint8 flag = 0U;
          quint8 mask = 1U;
          const int ipl4 = iplane*4;

          for (ii=0; ii<4; ++ii) {

            const int iid = ii + ipl4;
            int ivx = i + m_idel[iid][0]+stcol;
            int ivy = j + m_idel[iid][1]+strow;
            int ivz = k + m_idel[iid][2]+stsec;

            vec[ii].x() = ivx;
            vec[ii].y() = ivy;
            vec[ii].z() = ivz;

            val[ii] = pMap->atFloat((ivx+10000*na)%na,
                                    (ivy+10000*nb)%nb,
                                    (ivz+10000*nc)%nc);
            if (val[ii]>isolev)
              flag += mask;
            mask = mask << 1;
          }

          if (flag==0||flag==15) {
            // no intersections
            continue;
          }

          for (ii=0; ii<2; ii++) {
            int iv0 = m_triTab2[flag][ii*2+0];
            int iv1 = m_triTab2[flag][ii*2+1];
            if (iv0<0)
              break;

            Vector3F v0, v1;
            if (m_bUseIntpol &&
                xsol.solve(val[iv0], vec[iv0], val[(iv0+1)%4], vec[(iv0+1)%4], v0) &&
                xsol.solve(val[iv1], vec[iv1], val[(iv1+1)%4], vec[(iv1+1)%4], v1) ){
              if (m_dArcMax>0.0f) {
                divideAndDraw(pdl, v0, v1, iplane);
                //divideDraw2(pdl, v0, v1, iplane);
              }
              else {
                pdl->vertex(v0.x(), v0.y(), v0.z());
                pdl->vertex(v1.x(), v1.y(), v1.z());
              }
            }
            else {
              // do not use intpol / ERROR!! Newton method does not converge
              v0 = getXValF(val[iv0], vec[iv0], val[(iv0+1)%4], vec[(iv0+1)%4], isolev);
              v1 = getXValF(val[iv1], vec[iv1], val[(iv1+1)%4], vec[(iv1+1)%4], isolev);
              pdl->vertex(v0.x(), v0.y(), v0.z());
              pdl->vertex(v1.x(), v1.y(), v1.z());
            }

          }
        }
      }

  pdl->end();

  pdl->popMatrix();
}

