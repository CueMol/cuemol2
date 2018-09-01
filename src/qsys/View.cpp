// -*-Mode: C++;-*-
//
// View: Generic Molecule View Class
//
// $Id: View.cpp,v 1.48 2011/03/13 12:02:45 rishitani Exp $
//

#include <common.h>

#include "View.hpp"
#include "Scene.hpp"
#include "SceneManager.hpp"
#include "ScrEventManager.hpp"
#include "DrawObj.hpp"
#include "ViewInputConfig.hpp"
#include "MomentumScroll.hpp"
#include "ViewCap.hpp"

#include "style/StyleSheet.hpp"
#include "style/StyleMgr.hpp"
#include "style/StyleEditInfo.hpp"

#include <gfx/DisplayContext.hpp>
#include <qlib/Utils.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

//#include <cmath>
#include <boost/math/special_functions/fpclassify.hpp>

using namespace qsys;

MB_PUBLIC ViewCap *View::m_spViewCap = NULL;

View::View()
{
  m_bProjChg = true;

  m_pInConf = ViewInputConfig::getInstance();
  
  m_pStyles = MB_NEW StyleSheet();

  m_pEvtCaster = MB_NEW ViewEventCaster;
  m_uid = qlib::ObjectManager::sRegObj(this);
  MB_DPRINTLN("### View (%p/%d) created\n", this, m_uid);

  // ???
  m_nWidth = 100;
  m_nHeight = 100;

  //m_tkrad = 0.8f;

  addListener(this);

  m_cursorName = "default";
  m_bActive = true;

  m_pMscr = new MomentumScroll(this);
  m_bRotMMS = false;
  m_bTransMMS = false;

  m_bSwapStereoEyes = false;

  m_bUseSclFac = false;
  m_sclfac_x = 1.0;
  m_sclfac_y = 1.0;

  // m_fViewDist = 200.0f;
  // m_ltAmbi = Vector4D(0.2f, 0.2f, 0.2f);
  // m_ltDiff = Vector4D(0.8f, 0.8f, 0.8f);
  // m_ltSpec = Vector4D(.4f, .4f, .4f);
  //  m_fHitPrec = 10.0;
}

View::View(const View &r)
{
  m_uid = qlib::ObjectManager::sRegObj(this);
  MB_DPRINTLN("Cannot create View copy (%p/%d)\n", this, m_uid);
  MB_ASSERT(false);
}

View::~View()
{
  m_pMscr->cancel();
  qlib::EventManager::getInstance()->removeTimer(this);
  if (m_pMscr!=NULL)
    delete m_pMscr;

  m_drawObjTab.clear();

  delete m_pEvtCaster;
  delete m_pStyles;

  MB_DPRINTLN("View(%p) destructed\n", this);
  qlib::ObjectManager::sUnregObj(m_uid);
}

//////////////////////////////////

void View::unloading()
{
  m_pMscr->cancel();
  qlib::EventManager::getInstance()->removeTimer(this);
}

LString View::toString() const
{
  return LString::format("View(name=%s, UID=%d)",m_name.c_str(), getUID());
}

void View::dump() const
{
  MB_DPRINT("View: %s/%d(%p)", m_name.c_str(), m_uid, this);
}

void View::setSceneID(qlib::uid_t nid)
{
  m_pStyles->setScopeID(nid);
  m_nSceneID = nid;
}

//////////////////////////////////

void View::setViewDist(double d)
{
  if (!qlib::isNear4<double>(d, m_curcam.getCamDist())) {
    m_curcam.setCamDist(d);
    setProjChange();
    setUpdateFlag();

    // fire event
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG);
    ev.setDescr("distance");
    fireViewEvent(ev);
  }
}

void View::setZoom(double f)
{
  if (f<F_EPS4) {
    // too small or negative zoom value --> truncate
    f = F_EPS4;
  }

  if ( qlib::isNear4<double>(f, m_curcam.getZoom()) ) {
    // not changed from the previous value
    return;
  }
    
  m_curcam.setZoom(f);
  setProjChange();
  setUpdateFlag();

  // fire event
  ViewEvent ev;
  ev.setType(ViewEvent::VWE_PROPCHG);
  ev.setDescr("zoom");
  fireViewEvent(ev);
}

void View::setSlabDepth(double d)
{
  d = qlib::trunc(d, 0.1, getViewDist()*2.0);

  if ( qlib::isNear4<double>(m_curcam.getSlabDepth(), d) ) {
    // not changed from the previous value
    return;
  }

  m_curcam.setSlabDepth(d);
  setProjChange();
  setUpdateFlag();
  
  // fire event
  ViewEvent ev;
  ev.setType(ViewEvent::VWE_PROPCHG);
  ev.setDescr("slab");
  fireViewEvent(ev);
}

void View::setViewCenter(const qlib::Vector4D &pos)
{
  m_curcam.m_center = pos;
  setUpdateFlag();
  m_bCenterChanged = false;

  // fire event
  {
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG);
    ev.setDescr("center");
    fireViewEvent(ev);
  }
}

void View::setViewCenterDrag(const qlib::Vector4D &pos)
{
  m_curcam.m_center = pos;
  setUpdateFlag();
  m_bCenterChanged = true;

  // fire event
  {
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG_DRG);
    ev.setDescr("center");
    fireViewEvent(ev);
  }
  // MB_DPRINTLN("viewcen chg drg %f,%f,%f", pos.x(), pos.y(), pos.z());
}

void View::setViewCenterAnim(const qlib::Vector4D &pos)
{
  m_pMscr->setupSetXYZ(pos);
  qlib::EventManager::getInstance()->setTimer(this, 500);
}

void View::setRotQuat(const qlib::LQuat &q)
{
  m_curcam.m_rotQuat = q;
  // normalization
  const double sqlen = m_curcam.m_rotQuat.sqlen();
  if (!qlib::isNear8(sqlen, 1.0)) {
    if (qlib::isNear4(sqlen, 0.0)) {
      // division by zero
      m_curcam.m_rotQuat = LQuat();
    }
    // else if (!std::isfinite(sqlen)) {
    else if (!boost::math::isfinite(sqlen)) {
      // setting NaN or Inf
      m_curcam.m_rotQuat = LQuat();
    }
    else {
      // normal case
      m_curcam.m_rotQuat /= ::sqrt(sqlen);
    }
  }
  setUpdateFlag();

  // fire event
  ViewEvent ev;
  ev.setType(ViewEvent::VWE_PROPCHG);
  ev.setDescr("rotation");
  fireViewEvent(ev);
}


/// Rotate view around axes
void View::rotateView(double dax, double day, double daz)
{
  if (qlib::abs<double>(dax)>F_EPS8)
    m_curcam.m_rotQuat = m_curcam.m_rotQuat.rotateX(dax);

  if (qlib::abs<double>(day)>F_EPS8)
    m_curcam.m_rotQuat = m_curcam.m_rotQuat.rotateY(day);

  if (qlib::abs<double>(daz)>F_EPS8)
    m_curcam.m_rotQuat = m_curcam.m_rotQuat.rotateZ(daz);

  //MB_DPRINTLN("QUAT len=%f", m_curcam.m_rotQuat.sqlen());

  m_curcam.m_rotQuat.normalizeSelf(F_EPS8);

  //MB_DPRINTLN("After NS QUAT len=%f", m_curcam.m_rotQuat.sqlen());

  setUpdateFlag();

  // fire event
  ViewEvent ev;
  ev.setType(ViewEvent::VWE_PROPCHG);
  ev.setDescr("rotation");
  fireViewEvent(ev);
}

void View::translateView(double dax, double day, double daz)
{
  Vector4D dv1, dv2;
  if (qlib::abs<double>(dax)>F_EPS8 || qlib::abs<double>(day)>F_EPS8) {
    convXYTrans(dax, day, dv1);
  }

  if (qlib::abs<double>(daz)>F_EPS8) {
    convZTrans(daz, dv2);
  }

  setViewCenter(getViewCenter()-dv1-dv2);
  //setUpdateFlag();
}

void View::translateViewDrag(double dax, double day, double daz)
{
  Vector4D dv1, dv2;
  if (qlib::abs<double>(dax)>F_EPS8 || qlib::abs<double>(day)>F_EPS8)
    convXYTrans(dax, day, dv1);

  if (qlib::abs<double>(daz)>F_EPS8)
    convZTrans(daz, dv2);

  setViewCenterDrag(getViewCenter()-dv1-dv2);
}

// create quaternion rotation (x1,y1) --> (x2,y2)
void View::trackBallMove(double curX, double curY, double prevX, double prevY)
{
  /*
  // We need to perform some transformation on X in para/cross stereo mode.
  int nSteMode = getStereoMode();
  if (nSteMode==STEREO_PARA ||
      nSteMode==STEREO_CROSS) {
    if (prevX<0.5f)
      prevX = 2.0f*prevX;
    else
      prevX = 2.0f*(prevX-0.5f);

    if (curX<0.5f)
      curX = 2.0f*curX;
    else
      curX = 2.0f*(curX-0.5f);
  }
  */
  //lock();
  
  Vector4D vaxis;
  double phi;
  getTrackRotQuat(curX, curY, prevX, prevY, vaxis, phi);
  qlib::LQuat dqrot(vaxis, phi);
  //MB_DPRINTLN("tk (%s,%f) rq=%s, dq=%s",
  //vaxis.toString().c_str(), phi, 
  //m_curcam.m_rotQuat.m_data.toString().c_str(),
  //dqrot.m_data.toString().c_str());
  m_curcam.m_rotQuat.mulSelf( dqrot );

  //m_curcam.m_rotQuat = dqrot * m_curcam.m_rotQuat;
  m_curcam.m_rotQuat.normalizeSelf(F_EPS8);

  setUpdateFlag();

  // fire event
  ViewEvent ev;
  ev.setType(ViewEvent::VWE_PROPCHG);
  ev.setDescr("rotation");
  fireViewEvent(ev);
}

namespace {
  void projSphere(qlib::Vector4D &vec, double tkrad)
  {
    double d = (double) vec.length();
    if (d < tkrad*0.70710678118654752440) {
      // inside sphere
      vec.z() = sqrt(tkrad*tkrad - d*d);
    } else {
      // on hyperbola
      vec.z() = (tkrad*tkrad / 2) / d;
    }
  }
}

void View::getTrackRotQuat(double curX, double curY,
                           double prevX, double prevY,
                           Vector4D &vaxis, double &rphi)
{
  const double tkrad = m_pInConf->getTbRad();
  double x1, y1 ,x2 , y2;

  x1 = 2.0f*prevX - 1.0;
  x2 = 2.0f*curX - 1.0;
  y1 = 1.0 - 2.0*prevY;
  y2 = 1.0 - 2.0*curY;
  
  qlib::Vector4D p1(x1, y1, 0);
  projSphere(p1, tkrad);

  qlib::Vector4D p2(x2, y2, 0);
  projSphere(p2, tkrad);

  vaxis = p2.cross(p1);
  const double vlen = vaxis.length();
  //if (!std::isfinite(vlen) ||
  if (!boost::math::isfinite(vlen) ||
      qlib::isNear4(vlen, 0.0)) {
    vaxis = Vector4D();
    rphi = 0.0;
    return;
  }
      
  // normalization
  vaxis /= vlen;

  qlib::Vector4D vdist = p1-p2;
  const double vdlen = vdist.length();
  //MB_DPRINTLN("vdlen: %f", vdlen);
  //MB_DPRINTLN("tkrad: %f", tkrad);

  double t = vdlen/(2.0*tkrad);
  //MB_DPRINTLN("-> t: %f", t);

  if (t>1.0)
    t = 1.0;
  if (t<-1.0)
    t = -1.0;

  rphi = 2.0*asin(t);

  //MB_DPRINT("rot phi=%f\n", phi/M_PI*180);
  if (rphi<1E-5) {
    //MB_DPRINT("rot phi=%f too small!!\n", phi/M_PI*180);
    //return qlib::LQuat(1.0, 0.0, 0.0, 0.0);
    vaxis = Vector4D();
    rphi = 0.0;
    return;
  }
  //return qlib::LQuat(vaxis, phi);
}

void View::convXYTrans(double adx, double ady, Vector4D &vec) const
{
  const double h = getHeight();
  const double zoom = m_curcam.getZoom();
  const double dx = adx*zoom/h;
  const double dy = -ady*zoom/h;

  //lock();
  LQuat tmpq = m_curcam.m_rotQuat.conj();
  //unlock();
  Matrix4D rmat = Matrix4D::makeRotMat(tmpq);

  vec.x() = dx;
  vec.y() = dy;
  vec.z() = 0;
  vec.w() = 0;
  rmat.xform3D(vec);
}

void View::convZTrans(double dz, Vector4D &vec) const
{
  //double dz = idz;
  // XXX ???
  //dz *= m_fViewWidth;
  dz /= 4.0;

  //lock();
  LQuat tmpq = m_curcam.m_rotQuat.conj();
  //unlock();

  Matrix4D rmat = tmpq.toRotMatrix();

  vec = Vector4D(0, 0, -dz, 0);
  rmat.xform4D(vec);
}

Vector4D View::getUpVector() const
{
  Vector4D res;
  convXYTrans(0.0, -1.0, res);
  res = res.normalize();
  return res;
}

Vector4D View::getRightVector() const
{
  Vector4D res;
  convXYTrans(1.0, 0.0, res);
  res = res.normalize();
  return res;
}

Vector4D View::getForwardVector() const
{
  Vector4D res;
  convZTrans(-1.0, res);
  res = res.normalize();
  return res;
}

void View::setPerspec(bool b)
{
  if (m_curcam.m_fPerspec != b) {
    m_curcam.m_fPerspec = b;
    setProjChange();
    setUpdateFlag();
  }
}


void View::setStereoMode(int f)
{
  if (m_curcam.getStereoMode() != f) {
    m_curcam.setStereoMode(f);
    setProjChange();
    setUpdateFlag();
  }
}

/////////////////////////////////////////////////////
// Utility routines


bool View::safeSetCurrent()
{
  gfx::DisplayContext *pCtxt = getDisplayContext();
  if (pCtxt==NULL)
    return false;

  pCtxt->setTargetView(this);
  if (!pCtxt->setCurrent()) {
    LOG_DPRINTLN("View::setup() setCurrent failed.");
    return false;
  }

  return true;
}


/////////////////////////////////////////////////////
// View size

void View::sizeChanged(int cx, int cy)
{
  m_nWidth = cx;
  m_nHeight = cy;

  //setUpProjMat(-1, -1);
  setProjChange();
  setUpdateFlag();

  // fire event
  {
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_SIZECHG);
    fireViewEvent(ev);
  }
}

////////////////////////////////////////////////////////
// InDevEvent message handlers

/// Mouse drag start event
bool View::mouseDragStart(InDevEvent &ev)
{
  // initialize work flags
  m_nMouseMode = 0;

  // save pre-drag state
  //m_saveViewCenter = getViewCenter();
  //m_saveRotQuat = getRotQuat();
  m_bCenterChanged = false;

  // XXX : ??
  setCursor("-moz-grabbing");

  return true;
}

void View::rotXY(double posx, double posy,
                 double delx, double dely,
		 double width, double height)
{
  trackBallMove(double(posx)/width,
                double(posy)/height,
                double(posx-delx)/width,
                double(posy-dely)/height);
  return;
}

bool View::handleMouseDragImpl(int xid, double delta)
{
  bool fupdate = false;
  Vector4D vec;

  switch (xid) {
  case ViewInputConfig::VIEW_ROTX:
    rotateView(delta/4.0, 0.0, 0.0);
    fupdate = true;
    break;
  case ViewInputConfig::VIEW_ROTY:
    rotateView(0.0, delta/4.0, 0.0);
    fupdate = true;
    break;
  case ViewInputConfig::VIEW_ROTZ:
    rotateView(0.0, 0.0, delta/4.0);
    fupdate = true;
    break;

  case ViewInputConfig::VIEW_TRAX:
    convXYTrans(delta, 0, vec);
    //setCenterNoev(getViewCenter()-vec);
    setViewCenterDrag(getViewCenter()-vec);
    fupdate = true;
    break;
  case ViewInputConfig::VIEW_TRAY:
    convXYTrans(0, delta, vec);
    //setCenterNoev(getViewCenter()-vec);
    setViewCenterDrag(getViewCenter()-vec);
    fupdate = true;
    break;
  case ViewInputConfig::VIEW_TRAZ:
    convZTrans(delta, vec);
    //setCenterNoev(getViewCenter()-vec);
    setViewCenterDrag(getViewCenter()-vec);
    fupdate = true;
    break;

  case ViewInputConfig::VIEW_SLAB: {
    double vw = getSlabDepth();
    double dw = double(delta)/200.0 * vw;
    setSlabDepth(vw+dw);
    // setUpProjMat(-1, -1);
    fupdate = true;
    break;
  }
  case ViewInputConfig::VIEW_ZOOM: {
    double vw = getZoom();
    double dw = double(delta)/200.0 * vw;
    setZoom(vw+dw);
    // setUpProjMat(-1, -1);
    fupdate = true;
    break;
  }
  default:
    break;
  }

  return fupdate;
}


bool View::mouseDragMove(InDevEvent &ev)
{
  // View *pview = ev.getSource();
  Vector4D vec;

  const double width = (double) getWidth();
  const double height = (double) getHeight();

  int xid = m_pInConf->findEvent(ViewInputConfig::MOUSE_XAXIS, ev);
  int yid = m_pInConf->findEvent(ViewInputConfig::MOUSE_YAXIS, ev);

  if (xid<0&&yid<0) return false;

  //
  // handle special cases
  //

  // xrot-yrot pair
  if (xid==ViewInputConfig::VIEW_ROTX && yid==ViewInputConfig::VIEW_ROTY) {
    double width = getWidth();
    double height = getHeight();
    rotXY(ev.getX(), ev.getY(),
          ev.getDeltaX(), ev.getDeltaY(),
          width, height);
    forceRedraw();
    if (m_bRotMMS)
      m_pMscr->setType(MomentumScroll::MMS_ROTXY);
    return true;
  }
  else if (xid==ViewInputConfig::VIEW_ROTY && yid==ViewInputConfig::VIEW_ROTX) {
    double width = getWidth();
    double height = getHeight();
    rotXY(ev.getY(), ev.getX(),
          ev.getDeltaY(), ev.getDeltaX(),
          height, width);
    forceRedraw();
    return true;
  }

  // trax-tray pair
  if (xid==ViewInputConfig::VIEW_TRAX && yid==ViewInputConfig::VIEW_TRAY) {
    convXYTrans(ev.getDeltaX(), ev.getDeltaY(), vec);
    setViewCenterDrag(getViewCenter()-vec);
    forceRedraw();
    if (m_bTransMMS)
      m_pMscr->setType(MomentumScroll::MMS_TRANSXY);
    return true;
  }
  else if (xid==ViewInputConfig::VIEW_TRAY && yid==ViewInputConfig::VIEW_TRAX) {
    convXYTrans(ev.getDeltaY(), ev.getDeltaX(), vec);
    setViewCenterDrag(getViewCenter()-vec);
    forceRedraw();
    return true;
  }

  //
  // handle general cases
  //
  bool fupdate = false;

  double delx = ev.getDeltaX();
  double dely = ev.getDeltaY();

  MB_DPRINTLN("MouseMode %d", m_nMouseMode);
  if (m_nMouseMode==0) {
    if (qlib::abs(delx)>qlib::abs(dely)) {
      m_nMouseMode=1;
      MB_DPRINTLN("Set X-mode");
    }
    else {
      m_nMouseMode=2;
      MB_DPRINTLN("Set Y-mode");
    }
  }
  
  if (m_nMouseMode==1) {
    //MB_DPRINTLN("MouseDrag X-mode ID=%d", xid);
    fupdate = handleMouseDragImpl(xid, delx);
  }
  else if (m_nMouseMode==2) {
    //MB_DPRINTLN("MouseDrag Y-mode ID=%d", yid);
    fupdate = handleMouseDragImpl(yid, dely);
  }
  else {
    fupdate |= handleMouseDragImpl(xid, delx);
    fupdate |= handleMouseDragImpl(yid, dely);
  }

  if (fupdate) {
    forceRedraw();
    return true;
  }

  return false;
}

bool View::mouseWheel(InDevEvent &ev)
{
  int xid = m_pInConf->findEvent(ViewInputConfig::MOUSE_WHEEL1, ev);

  /*
  const double del = double(ev.getDeltaX())/500.0;
  double cv = getZoom();
  cv += cv*del;
  cv = qlib::max(cv, 0.1);
  cv = qlib::min(cv, 1000.0);
  //  MB_DPRINTLN("zoom: %f", cv);
   */
  bool fupdate;
  fupdate = handleMouseDragImpl(xid, ev.getDeltaX()/2.5);

  //setZoom(cv);
  if (fupdate)
    forceRedraw();

  return true;
}

/** mouse drag end event */
bool View::mouseDragEnd(InDevEvent &ev)
{
  if (m_bCenterChanged) {
    setViewCenter(getViewCenter());
  }

#if (GUI_ARCH==OSX)
  setCursor("auto");
#else
  setCursor("default");
#endif

  if (m_pMscr->getType()!=MomentumScroll::MMS_NONE) {
    qlib::time_value peri = m_pMscr->setupXY(ev);
    if (peri>0)
      qlib::EventManager::getInstance()->setTimer(this, peri);
  }

  return true;
}

bool View::onTimer(double t, qlib::time_value curr, bool bLast)
{
  if (m_pMscr->isActive()) {
    return m_pMscr->onTimer(t);
  }
  else {
    return false;
  }
}

void View::cancelMomentumScroll()
{
  m_pMscr->cancel();
}

/** mouse click event (L,M,R button)*/
bool View::mouseClicked(InDevEvent &ev)
{
  //clickHelper(ev, false);
  return true;
}

/** mouse double click event (L,M,R button)*/
bool View::mouseDoubleClicked(InDevEvent &ev)
{
  //clickHelper(ev, true);
  return true;
}

gfx::DisplayContext *View::getSiblingCtxt()
{
  ScenePtr rsc = getScene();
  if (rsc.isnull()) return NULL;

  Scene::ViewIter viter = rsc->beginView();
  for (; viter!=rsc->endView(); ++viter) {
    if (viter->first!=m_uid) {
      qsys::ViewPtr sibvw = viter->second;
      if (sibvw.isnull())
	continue;
      return sibvw->getDisplayContext();
    }
  }
  return NULL;
}

qlib::uid_t View::getRootUID() const
{
  return getUID();
}

/////////////////////////////////////////////////////////
// Events

int View::addListener(InDevListener *p)
{
  return m_listeners.add(p);
}

bool View::removeListener(InDevListener *p)
{
  return m_listeners.remove(p);
}

bool View::removeListener(int nid)
{
  if (m_listeners.remove(nid)==NULL)
    return false;
  return true;
}

/*int View::addViewListener(ViewEventListener *pL)
{
  return m_pEvtCaster->add(pL);
}*/

/*bool View::removeViewListener(ViewEventListener *pL)
{
  return m_pEvtCaster->remove(pL);
}*/

void View::fireViewEvent(ViewEvent &ev)
{
  m_pEvtCaster->replicaFire(ev);

  ScrEventManager *pSEM = ScrEventManager::getInstance();
  ev.setTarget(getUID());
  ev.setTargetPtr(this);
  ev.setSource(m_nSceneID);
  pSEM->fireViewEvent(ev);
}

///////////////////////////////////////////

void View::setCameraAnim(CameraPtr rcam, bool bAnim)
{
  if (!m_curcam.equals(*rcam.get()) && bAnim) {
    m_pMscr->setupSetCamera(rcam);
    qlib::EventManager::getInstance()->setTimer(this, 500);
  }
  else {
    m_curcam = Camera(*(rcam.get()));
    m_curcam.setSource("");

    // camera changed, so we must update proj matrix
    setProjChange();
    setUpdateFlag();

    // Fire event
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG);
    ev.setDescr("setCamera");
    fireViewEvent(ev);

    //MB_DPRINTLN(">>>>> View.setCameraAnim() quat=%s",
    //getRotQuat().toString().c_str());
  }
}

ScenePtr View::getScene() const
{
  return SceneManager::getSceneS(m_nSceneID);
}

void View::setCursor(const LString &cursor)
{
  m_cursorName = cursor;

  InDevEvent ev;
  ev.setType(InDevEvent::INDEV_MOUSE_ENTER);
  ev.setModifier(0);
  ev.setSource(this);
  fireInDevEvent(ev);
}

void View::fireInDevEvent(InDevEvent &ev)
{
  LString category;
  const int nev = ev.getType();
  switch (nev) {
  case InDevEvent::INDEV_LBTN_CLICK:
  case InDevEvent::INDEV_RBTN_CLICK:
  case InDevEvent::INDEV_MBTN_CLICK:
    // MB_DPRINTLN("View.fireInDevEvent> mouseClicked");
    category = "mouseClicked";
    break;
        
  case InDevEvent::INDEV_LBTN_DBLCLICK:
  case InDevEvent::INDEV_RBTN_DBLCLICK:
  case InDevEvent::INDEV_MBTN_DBLCLICK:
    category = "mouseDoubleClicked";
    break;

  case InDevEvent::INDEV_DRAG_START:
    m_pMscr->cancel();
    category = "mouseDragStart";
    break;

  case InDevEvent::INDEV_DRAG_MOVE:
    category = "mouseDragMove";
    break;

  case InDevEvent::INDEV_DRAG_END:
    category = "mouseDragEnd";
    break;

  case InDevEvent::INDEV_WHEEL:
    m_pMscr->cancel();
    category = "mouseWheel";
    break;

  case InDevEvent::INDEV_MOUSE_DOWN:
    m_pMscr->cancel();
    category = "mouseDown";
    break;

  case InDevEvent::INDEV_MOUSE_ENTER:
    category = "mouseEnter";
    break;

  default:
    MB_ASSERT(false);
    break;
  }

  // Notify script event listeners
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  bool ok = 
    pSEM->fireEventScript(category,
                          ScrEventManager::SEM_INDEV,
                          ScrEventManager::SEM_OTHER,
                          m_uid, ev);

  // !ok --> Event default propagation is canceled
  if (ok)
    return;

  // Notify native event listeners
  m_listeners.fire(ev);
}

//////////////////////////////////////////////////////

DrawObjPtr View::getDrawObj(const LString &clsname)
{
  drawobjtab_t::const_iterator iter = m_drawObjTab.find(clsname);
  if (iter!=m_drawObjTab.end())
    return iter->second;

  qlib::ClassRegistry *pCR = qlib::ClassRegistry::getInstance();
  qlib::LClass *pCls = pCR->getClassObj(clsname);
  
  qlib::LDynamic *pObj0 = pCls->createObj();
  DrawObj *pObj = dynamic_cast<DrawObj *>(pObj0);

  if (pObj==NULL) {
    LString msg = LString::format("FatalERROR: Class %s is not DrawObj", clsname.c_str());
    MB_THROW(qlib::InvalidCastException, msg);
    return DrawObjPtr();
  }
  
  DrawObjPtr pRes(pObj);
  m_drawObjTab.insert(drawobjtab_t::value_type(clsname, pRes));

  return pRes;
}

void View::showDrawObj(DisplayContext *pdc)
{
  drawobjtab_t::const_iterator iter = m_drawObjTab.begin();
  drawobjtab_t::const_iterator eiter = m_drawObjTab.end();

  for (; iter!=eiter; ++iter) {
    if (!iter->second->isEnabled())
      continue;
    iter->second->display(pdc);
  }
}

void View::showDrawObj2D(DisplayContext *pdc)
{
  drawobjtab_t::const_iterator iter = m_drawObjTab.begin();
  drawobjtab_t::const_iterator eiter = m_drawObjTab.end();

  for (; iter!=eiter; ++iter) {
    if (!iter->second->isEnabled())
      continue;
    iter->second->display2D(pdc);
  }
}

bool View::hasHWStereo() const
{
  return false;
}

//////////////////////////////
// DrawObj

DrawObj::DrawObj()
     : m_bEnabled(false)
{
}

DrawObj::~DrawObj()
{
}

void DrawObj::setEnabled(bool f)
{
  m_bEnabled = f;
}

////////

View *View::createOffScreenView(int w, int h, int aa_depth)
{
  return NULL;
}

void View::readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize, int ncomp)
{
}

void View::swapBuffers()
{
}

////////////////////////////////////////
// Style supports

bool View::resetProperty(const LString &propnm)
{
  bool res = StyleResetPropImpl::resetProperty(propnm, this);
  if (!res) {
    // stylesheet value is not found --> default behaviour
    return super_t::resetProperty(propnm);
  }

  return true;
}

StyleSheet *View::getStyleSheet() const
{
  return m_pStyles;
}

void View::styleChanged(StyleEvent &ev)
{
  m_pStyles->applyStyle(this);
}

qlib::uid_t View::getStyleCtxtID() const
{
  return m_nSceneID;
}

//

LString View::getStyleNames() const
{
  return m_pStyles->getStyleNames();
}

void View::applyStyles(const LString &n)
{
  //LString ov = m_pStyles->getStyleNames();

  m_pStyles->setStyleNames(n);
  m_pStyles->applyStyle(this);

  // setupStyleUndo(ov, n);

  // Style changed & prop changed event
  fireStyleEvents();
}

bool View::pushStyle(const LString &name)
{
  //LString ov = m_pStyles->getStyleNames();

  if (!m_pStyles->append(name))
    return false; // name is in already top style entry

  m_pStyles->applyStyle(this);

  //LString nv = m_pStyles->getStyleNames();
  //setupStyleUndo(ov, nv);

  fireStyleEvents();

  return true;
}

bool View::removeStyleRegex(const LString &regex)
{
  //LString ov = m_pStyles->getStyleNames();

  if (!m_pStyles->removeByRe(regex))
    return false; // no match

  //LString nv = m_pStyles->getStyleNames();
  //setupStyleUndo(ov, nv);

  fireStyleEvents();
  return true;
}

void View::fireStyleEvents()
{
  // Style changed event
  {
    StyleEvent ev;
    styleChanged(ev);
  }

  // Fire propchanged event (for styles prop)
  /*{
    ViewEvent obe;
    qlib::LPropEvent ev("styles");
    obe.setType(ViewEvent::RNE_PROPCHG);
    obe.setTarget(getUID());
    obe.setDescr("styles");
    obe.setPropEvent(&ev);
    fireViewEvent(obe);
  }*/
}


LString View::hitTest(int x, int y)
{
  return LString();
}

LString View::hitTestRect(int x, int y, int w, int h, bool bNearest)
{
  return LString();
}


//static
bool View::hasVS()
{
  if (m_spViewCap==NULL) return false;
  return m_spViewCap->hasVertShader();
}

//static
bool View::hasGS()
{
  if (m_spViewCap==NULL) return false;
  return m_spViewCap->hasGeomShader();
}

//static
bool View::hasFBO()
{
  if (m_spViewCap==NULL) return false;
  return m_spViewCap->hasFBO();
}

//static
bool View::hasVBO()
{
  if (m_spViewCap==NULL) return false;
  return m_spViewCap->hasVBO();
}

//////////////////////////////////
// view factory methods

//static
ViewFactory *View::m_spViewFac;

//static
void View::setViewFactory(ViewFactory *pVF)
{
  m_spViewFac = pVF;
}

//static
View *View::createView()
{
  if (m_spViewFac==NULL)
    return NULL;

  return m_spViewFac->create();
}

