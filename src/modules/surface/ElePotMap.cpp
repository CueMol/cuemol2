// -*-Mode: C++;-*-
//
// electrostatic potential map
//
// $Id: ElePotMap.cpp,v 1.3 2011/04/03 08:08:46 rishitani Exp $

#include <common.h>

#include "ElePotMap.hpp"
#include "QdfPotWriter.hpp"

using namespace surface;
using qlib::Matrix3D;

ElePotMap::ElePotMap()
     : m_pMap(NULL)
{
  m_gx = 1.0;
  m_gy = 1.0;
  m_gz = 1.0;
}

ElePotMap::~ElePotMap()
{
  if (m_pMap!=NULL)
    delete m_pMap;
}

bool ElePotMap::setMapFloatArray(const float *array,
                                 int ncol, int nrow, int nsect,
                                 double scale, const Vector4D &origpos)
{
  return setMapFloatArray(array,
                          ncol, nrow, nsect,
                          1.0/scale, 1.0/scale, 1.0/scale, 
                          origpos);
}

bool ElePotMap::setMapFloatArray(const float *array,
                                 int ncol, int nrow, int nsect,
                                 double gx, double gy, double gz,
                                 const Vector4D &origpos)
{
  if (m_pMap!=NULL)
    delete [] m_pMap;

  m_pMap = MB_NEW FloatMap(ncol, nrow, nsect, array);
  MB_DPRINTLN("OK.");

  m_gx = gx;
  m_gy = gy;
  m_gz = gz;
  m_origPos = origpos;

  //
  // calculate a statistics of the map
  //
  double rhomax=-1.0e100, rhomin=1.0e100,
  rhomean=0.0, sqmean=0.0,
  rhodev=0.0;

  const int ntotal = ncol*nrow*nsect;
  for (int i=0; i<ntotal; i++) {
    double rho = (double)array[i];
    rhomean += rho/float(ntotal);
    sqmean += rho*rho/float(ntotal);
    if (rho>rhomax)
      rhomax = rho;
    if (rho<rhomin)
      rhomin = rho;
  }

  rhodev = sqrt(sqmean-rhomean*rhomean);

  m_dMinMap = rhomin;
  m_dMaxMap = rhomax;
  m_dMeanMap = rhomean;
  m_dRmsdMap = rhodev;

  // map truncation level
  m_dLevelStep = (double)(rhomax - rhomin)/256.0;
  m_dLevelBase = rhomin;
  
  LOG_DPRINTLN("ElePot> Minimum: %f", rhomin);
  LOG_DPRINTLN("ElePot> maximum: %f", rhomax);
  LOG_DPRINTLN("ElePot> mean   : %f", rhomean);
  LOG_DPRINTLN("ElePot> r.m.s.d: %f", rhodev);

  return true;
}
  
double ElePotMap::smoothHelper(int x, int y, int z)
{
  const int nx = m_pMap->getColumns();
  const int ny = m_pMap->getRows();
  const int nz = m_pMap->getSections();

  double sum = 0.0;
  const int ne = m_deltas.size();

  BOOST_FOREACH(DeltaList::value_type del, m_deltas) {
    //DeltaList::const_iterator iter = m_deltas.begin();
    //for (; iter!=m_deltas.end(); ++iter) {
    const int ix = x + del.dx;
    const int iy = y + del.dy;
    const int iz = z + del.dz;
    if (!isInBoundary(ix, iy, iz))
      continue;
    sum += m_pMap->at(ix, iy, iz);
  }
  
  return sum/double(ne);

  /*
  for (int ix=x-nwin; ix<x+nwin; ix++) {
    for (int iy=y-nwin; iy<y+nwin; iy++) {
      for (int iz=z-nwin; iz<z+nwin; iz++) {
        ++ne;
        if (!isInBoundary(ix, iy, iz))
          continue;
        sum += m_pMap->at(ix, iy, iz);
      }
    }
  }
   */
}

void ElePotMap::smooth(double rad)
{
  if (m_pMap==NULL)
    return;

  int ix, iy, iz;
  const int mx = int(::floor(rad/m_gx));
  const int my = int(::floor(rad/m_gy));
  const int mz = int(::floor(rad/m_gz));

  //const int dmx1 = 2*mx+1;
  //const int dmy1 = 2*my+1;
  //const int msz = dmx1*dmy1*(2*mz+1);
  //bool *pflag = MB_NEW bool[msz];

  m_deltas.erase(m_deltas.begin(), m_deltas.end());

  for (ix=-mx; ix<=mx; ++ix) {
    for (iy=-my; iy<=my; ++iy) {
      for (iz=-mz; iz<=mz; ++iz) {
        //const int ii = (ix+mx) + ((iy+my) + (iz+mz)*dmy1)*dmx1;
        Vector4D pos(ix*m_gx, iy*m_gy, iz*m_gz);
        double dist = pos.length();
        if (dist<rad) {
          m_deltas.push_back(Delta(ix, iy, iz));
        }
      }
    }
  }

  const int nx = m_pMap->getColumns();
  const int ny = m_pMap->getRows();
  const int nz = m_pMap->getSections();

  FloatMap *pMap = MB_NEW FloatMap(nx, ny, nz);

  for (int ix=0; ix<nx; ix++) {
    for (int iy=0; iy<ny; iy++) {
      for (int iz=0; iz<nz; iz++) {
        pMap->at(ix, iy, iz) = smoothHelper(ix, iy, iz);
      }
    }
  }

  delete m_pMap;
  m_pMap = pMap;
}

///////////////////////////////////////////////

void ElePotMap::smooth2(double rad)
{
  if (m_pMap==NULL)
    return;

  int ix, iy, iz, jj;
  const int mx = int(::floor(rad/m_gx));
  const int my = int(::floor(rad/m_gy));
  const int mz = int(::floor(rad/m_gz));

  //const int dmx1 = 2*mx+1;
  //const int dmy1 = 2*my+1;
  //const int msz = dmx1*dmy1*(2*mz+1);
  //bool *pflag = MB_NEW bool[msz];

  const int nx = m_pMap->getColumns();
  const int ny = m_pMap->getRows();
  const int nz = m_pMap->getSections();

  FloatMap *pMap = MB_NEW FloatMap(nx, ny, nz);

  for (ix=0; ix<nx; ix++) {
    for (iy=0; iy<ny; iy++) {
      for (iz=0; iz<nz; iz++) {
        double sum = 0.0;
        for (jj=-mx; jj<mx; ++jj) {
          if (!isInBoundary(ix+jj, iy, iz))
            continue;
          sum += m_pMap->at(ix+jj, iy, iz);
        }
        pMap->at(ix, iy, iz) = sum/double(mx*2+1);
      }
    }
  }

  for (ix=0; ix<nx; ix++) {
    for (iy=0; iy<ny; iy++) {
      for (iz=0; iz<nz; iz++) {
        double sum = 0.0;
        for (jj=-my; jj<my; ++jj) {
          if (!isInBoundary(ix, iy+jj, iz))
            continue;
          sum += pMap->at(ix, iy+jj, iz);
        }
        m_pMap->at(ix, iy, iz) = sum/double(my*2+1);
      }
    }
  }
  
  for (ix=0; ix<nx; ix++) {
    for (iy=0; iy<ny; iy++) {
      for (iz=0; iz<nz; iz++) {
        double sum = 0.0;
        for (jj=-mz; jj<mz; ++jj) {
          if (!isInBoundary(ix, iy, iz+jj))
            continue;
          sum += m_pMap->at(ix, iy, iz+jj);
        }
        pMap->at(ix, iy, iz) = sum/double(mz*2+1);
      }
    }
  }

  delete m_pMap;
  m_pMap = pMap;
}

///////////////////////////////////////////////
// MbObject/ScalarObject interface

double ElePotMap::getValueAt(const Vector4D &pos) const
{
  if (m_pMap==NULL)
    return 0.0;

  Vector4D tv(pos);

  const Matrix4D &xfm = getXformMatrix();
  if (!xfm.isIdent()) {
    // apply inv of xformMat
    Matrix3D rmat = xfm.getMatrix3D();
    rmat = rmat.invert();
    Vector4D tr = xfm.getTransPart();
    tv -= tr;
    tv = rmat.mulvec(tv);
  }

  tv -= m_origPos;

  //tv = tv.scale(m_scale);
  tv.x() = tv.x() / m_gx;
  tv.y() = tv.y() / m_gy;
  tv.z() = tv.z() / m_gz;

  int nx = int(tv.x());
  int ny = int(tv.y());
  int nz = int(tv.z());

  if (nx<0 || nx>=m_pMap->getColumns()-1 ||
      ny<0 || ny>=m_pMap->getRows()-1 ||
      nz<0 || nz>=m_pMap->getSections()-1)
    return 0.0;

  double t = tv.x() - double(nx);
  double it= 1.0-t;
  double u = tv.y() - double(ny);
  double iu= 1.0-u;
  double v = tv.z() - double(nz);
  double iv= 1.0-v;

  double f00 = it*m_pMap->at(nx, ny, nz) + t*m_pMap->at(nx+1, ny, nz);
  double f10 = it*m_pMap->at(nx, ny+1, nz) + t*m_pMap->at(nx+1, ny+1, nz);
  double f01 = it*m_pMap->at(nx, ny, nz+1) + t*m_pMap->at(nx+1, ny, nz+1);
  double f11 = it*m_pMap->at(nx, ny+1, nz+1) + t*m_pMap->at(nx+1, ny+1, nz+1);

  double g0 = iu*f00 + u*f10;
  double g1 = iu*f01 + u*f11;

  return iv*g0 + v*g1;
}

bool ElePotMap::isInRange(const Vector4D &pos) const
{
  if (m_pMap==NULL)
    return false;

  Vector4D tv(pos);

  const Matrix4D &xfm = getXformMatrix();
  if (!xfm.isIdent()) {
    // apply inv of xformMat
    Matrix3D rmat = xfm.getMatrix3D();
    rmat = rmat.invert();
    Vector4D tr = xfm.getTransPart();
    tv -= tr;
    tv = rmat.mulvec(tv);
  }

  tv -= m_origPos;

  //tv = tv.scale(m_scale);
  tv.x() = tv.x() / m_gx;
  tv.y() = tv.y() / m_gy;
  tv.z() = tv.z() / m_gz;

  if (tv.x()<0.0 || tv.x()>m_pMap->getColumns() ||
      tv.y()<0.0 || tv.y()>m_pMap->getRows() ||
      tv.z()<0.0 || tv.z()>m_pMap->getSections())
    return false;

  return true;
}
  
bool ElePotMap::isEmpty() const
{
  return m_pMap==NULL;
}
  
Vector4D ElePotMap::convToOrth(const Vector4D &index) const
{
  Vector4D tv = index;

  tv.x() = tv.x() * m_gx;
  tv.y() = tv.y() * m_gy;
  tv.z() = tv.z() * m_gz;

  tv += m_origPos;

  const Matrix4D &xfm = getXformMatrix();
  if (!xfm.isIdent()) {
    // Apply xformMat
    tv.w() = 1.0;
    tv = xfm.mulvec(tv);
  }

  return tv;
}

Vector4D ElePotMap::getCenter() const
{
  if (m_pMap==NULL)
    return Vector4D();

  Vector4D tv(double(m_pMap->getColumns())/2.0,
              double(m_pMap->getRows())/2.0,
              double(m_pMap->getSections())/2.0);
  tv = convToOrth(tv);

  return tv;
}

Vector4D ElePotMap::getOrigin() const
{
  return m_origPos;
}

double ElePotMap::getRmsdDensity() const
{
  return m_dRmsdMap;
}


double ElePotMap::getLevelBase() const
{
  return m_dLevelBase;
}

double ElePotMap::getLevelStep() const
{
  return m_dLevelStep;
}

bool ElePotMap::isInBoundary(int i, int j, int k) const
{
  if (m_pMap==NULL)
    return false;

  if (i<0 || m_pMap->cols()<=i)
    return false;
  if (j<0 || m_pMap->rows()<=j)
    return false;
  if (k<0 || m_pMap->secs()<=k)
    return false;
  return true;
}

unsigned char ElePotMap::atByte(int i, int j, int k) const
{
  if (m_pMap==NULL)
    return 0;

  double rho = atFloat(i,j,k);
  
  rho = (rho-m_dLevelBase)/m_dLevelStep;
  if (rho<0) rho = 0.0;
  if (rho>255) rho = 255.0;

  return (unsigned char)rho;
}

double ElePotMap::atFloat(int i, int j, int k) const
{
  if (m_pMap==NULL)
    return 0.0;
  return m_pMap->at(i, j, k);
}

int ElePotMap::getColNo() const
{
  if (m_pMap==NULL)
    return 0;
  return m_pMap->getColumns();
}

int ElePotMap::getRowNo() const
{
  if (m_pMap==NULL)
    return 0;
  return m_pMap->getRows();
}

int ElePotMap::getSecNo() const
{
  if (m_pMap==NULL)
    return 0;
  return m_pMap->getSections();
}

int ElePotMap::getStartCol() const
{
  return 0;
}

int ElePotMap::getStartRow() const
{
  return 0;
}

int ElePotMap::getStartSec() const
{
  return 0;
}

double ElePotMap::getColGridSize() const
{
  return m_gx;
  //return 1.0/m_scale;
}

double ElePotMap::getRowGridSize() const
{
  return m_gy;
  //return 1.0/m_scale;
}

double ElePotMap::getSecGridSize() const
{
  return m_gz;
  //return 1.0/m_scale;
}

//////////

LString ElePotMap::getDataChunkReaderName(int nQdfVer) const
{
  return LString("qdfpot");
}

void ElePotMap::writeDataChunkTo(qlib::LDom2OutStream &oos) const
{
  QdfPotWriter writer;
  writer.setVersion(oos.getQdfVer());
  writer.setEncType(oos.getQdfEncType());

  ElePotMap *pthis = const_cast<ElePotMap *>(this);
  writer.attach(qsys::ObjectPtr(pthis));
  writer.write(oos);
  writer.detach();
}

#if 0
LString ElePotMap::getHistogramJSON(double min, double max, int nbins)
{
  double dbinw = (max-min)/double(nbins);
  //int nbins = int( (m_dMaxMap-m_dMinMap)/dbinw );
  MB_DPRINTLN("DenMap.hist> nbins=%d", nbins);

  int ni = m_pMap->getColumns();
  int nj = m_pMap->getRows();
  int nk = m_pMap->getSections();

  std::vector<int> histo(nbins);
  for (int i=0; i<nbins; ++i)
    histo[i] = 0;
  
  for (int i=0; i<ni; ++i)
    for (int j=0; j<nj; ++j)
      for (int k=0; k<nk; ++k) {
        double rho = atFloat(i,j,k);
        int ind = (int) ::floor( (rho-min)/dbinw );
        if (ind<0 || ind>=nbins) {
          //MB_DPRINTLN("ERROR!! invalid density value at (%d,%d,%d)=%f", i,j,k,rho);
        }
        else {
          histo[ind]++;
        }
      }
        
  int nmax = 0;
  for (int i=0; i<nbins; ++i)
    nmax = qlib::max(histo[i], nmax);

  LString rval = "{";
  rval += LString::format("\"min\":%f,\n", m_dMinMap);
  rval += LString::format("\"max\":%f,\n", m_dMaxMap);
  rval += LString::format("\"nbin\":%d,\n", nbins);
  rval += LString::format("\"nmax\":%d,\n", nmax);
  rval += LString::format("\"sig\":%f,\n", m_dRmsdMap);
  rval += "\"histo\":[";
  for (int i=0; i<nbins; ++i) {
    MB_DPRINTLN("%d %d", i, histo[i]);
    if (i>0)
      rval += ",";
    rval += LString::format("%d", histo[i]);
  }
  rval += "]}\n";
  
  return rval;
}
#endif

void ElePotMap::fitView(const qsys::ViewPtr &pView, bool dummy) const
{
}

