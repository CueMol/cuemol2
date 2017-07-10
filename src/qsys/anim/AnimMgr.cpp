// -*-Mode: C++;-*-
//
// AnimMgr
//

#include <common.h>

#include "AnimMgr.hpp"
#include "PropAnim.hpp"
#include "AnimObjEvent.hpp"

#include <qlib/LDOM2Stream.hpp>
#include <qlib/EventManager.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SceneExporter.hpp>
#include <qsys/ScrEventManager.hpp>

using namespace qsys;

AnimMgr::AnimMgr()
{
  m_uid = qlib::ObjectManager::sRegObj(this);

  m_nTgtSceneID = qlib::invalid_uid;
  m_length = 0;
  m_loop = false;
  m_timeStart = 0;
  m_timeEnd = 0;
  m_timeRemain = 0;
  m_nState = AM_STOP;
  m_timeElapsed = 0;
  m_pEvMgr = qlib::EventManager::getInstance();

  addPropListener(this);
}

AnimMgr::~AnimMgr()
{
  m_pEvMgr->removeTimer(this);

  qlib::ObjectManager::sUnregObj(m_uid);
}

//////////////////////////////

ScenePtr AnimMgr::getTgtScene() const
{
  // ensureNotNull(m_pTgtView);
  // return m_pTgtView->getScene();
  return SceneManager::getSceneS(m_nTgtSceneID);
}

void AnimMgr::startImpl()
{
  resolveRelTime();

  m_pStartCam = CameraPtr();

  // set camera from the start camera name
  ScenePtr pScene = getTgtScene();

  if (!m_startCamName.isEmpty())
    m_pStartCam = pScene->getCamera(m_startCamName);

  if (m_pStartCam.isnull()) {
    // no camera name is specified
    ViewPtr pView = m_pTgtView;
    if (pView.isnull()) {
      // target view isn't set --> use the default view
      pView = pScene->getActiveView();
    }

    if (!pView.isnull()) {
      m_pStartCam = pView->getCamera();
    }
    else {
      // default view isn't present --> use default camera
      LOG_DPRINTLN("AnimMgr> Warning!! start camera not set");
      m_pStartCam = CameraPtr(MB_NEW Camera());
    }
  }

  setWorkCam(m_pStartCam);
  
  /////

  m_nState = AM_RUNNING;
  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    pObj->setState(AnimObj::AO_PRE);
  }

  ////////////////////////////////////////////////
  // Search the "primary object" of property animobj

  typedef std::map<LString, qlib::LScrSp<PropAnim> > prop_tl;
  prop_tl tl;
  
  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    // skip the disabled animobj
    if (pObj->isDisabled())
      continue;
    
    qlib::LScrSp<PropAnim> pPropAnim(pObj, qlib::no_throw_tag());
    if (pPropAnim.isnull())
      continue; // skip non-propanim objects

    // propanim object
    std::vector<qlib::uid_t> uids;
    pPropAnim->getTgtUIDs(this, uids);
    qlib::time_value tv_start = pPropAnim->getAbsStart();
    LString propnm = pPropAnim->getPropName();
    MB_DPRINTLN("anim %s tgtprop=%s", pPropAnim->getName().c_str(), propnm.c_str());

    BOOST_FOREACH (qlib::uid_t elem, uids) {
      LString key = LString::format("%d:%s", int( elem ), propnm.c_str());
      prop_tl::iterator iter = tl.find(key);
      if (iter==tl.end()) {
        tl.insert(prop_tl::value_type(key, pPropAnim));
      }
      else if (tv_start < iter->second->getAbsStart()) {
        iter->second = pPropAnim;
      }
    }
  }

  // call onPropInit() of the primary objects

  BOOST_FOREACH (const prop_tl::value_type &elem, tl) {
    const LString key = elem.first;
    int cpos = key.indexOf(':');
    const LString suid = key.substr(0, cpos);
    qlib::uid_t uid = qlib::invalid_uid;
    suid.toNum(&uid);

    qlib::LScrSp<PropAnim> pPropAnim = elem.second;
    MB_DPRINTLN("propanim %s (key=%s) is an initiator for Rend %d.",
                pPropAnim->getName().c_str(),
                //int( pPropAnim->getAbsStart() ),
                key.c_str(),
                int(uid));
    pPropAnim->onPropInit(this, uid);
  }

}

void AnimMgr::start(ViewPtr pView)
{
  if (m_nState==AM_STOP) {
    m_timeStart = m_pEvMgr->getCurrentTime();
    m_timeEnd = m_timeStart + m_length;
    m_pTgtView = pView;
    startImpl();

    m_pEvMgr->setTimer(this, m_length);
  }
  else if (m_nState==AM_PAUSED) {
    m_timeStart = m_pEvMgr->getCurrentTime() - m_timeElapsed;
    m_timeEnd = m_timeStart + m_length;
    m_nState = AM_RUNNING;

    m_pEvMgr->setTimer(this, m_timeRemain);
  }
}

void AnimMgr::stop()
{
  m_pEvMgr->removeTimer(this);
  m_timeStart = 0;
  m_timeEnd = 0;
  m_timeElapsed = 0;
  m_nState = AM_STOP;
  m_pTgtView = ViewPtr();
}

void AnimMgr::pause()
{
  if (m_nState==AM_RUNNING) {
    m_pEvMgr->removeTimer(this);
    m_timeRemain = qlib::max<qlib::time_value>(0, m_length - m_timeElapsed);
    m_timeStart = 0;
    m_timeEnd = 0;
    if (m_timeRemain>0) {
      m_nState = AM_PAUSED;
    }
    else {
      m_nState = AM_STOP;
      m_pTgtView = ViewPtr();
    }
    MB_DPRINTLN("AnimMgr pause remain=%ld", m_timeRemain);
  }
}

void AnimMgr::goTimeScr(const qlib::LScrTime &toTime, ViewPtr pView)
{
  qlib::time_value to_tv = toTime.getValue();
  goTime(to_tv, pView);
}

void AnimMgr::goTime(qlib::time_value to_tv, ViewPtr pView)
{
  MB_DPRINTLN("AnimMgr.goTime(%d) called", int(to_tv));

  stop();
  startImpl();
  m_pTgtView = pView;
  if (m_pStartCam.isnull())
    m_pStartCam = pView->getCamera();

  timeline tl;

  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    // skip the disabled animobj
    if (pObj->isDisabled())
      continue;
    qlib::time_value st = pObj->getAbsStart();
    qlib::time_value en = pObj->getAbsEnd();
    tl.insert(timeline::value_type(st, timeline_tuple(0, pObj)));
    tl.insert(timeline::value_type(en, timeline_tuple(1, pObj)));
  }

  BOOST_FOREACH (timeline::value_type elem, tl) {
    qlib::time_value tv = elem.first;
    if (tv>to_tv) {
      onTimerImpl(to_tv);
      break;
    }
    int ntype = elem.second.event_type;
    AnimObjPtr pObj = elem.second.pObj;
    MB_DPRINTLN("TL %d T=%d name=%s", int(tv), ntype, pObj->getName().c_str());

    onTimerImpl(tv);
  }

  pause();
}

void AnimMgr::onTimerImpl(qlib::time_value elapsed)
{
  m_timeElapsed = elapsed;
  //MB_DPRINTLN("time elapsed %ld", elapsed);

  setWorkCam(m_pStartCam);

  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    // skip the disabled animobj
    if (pObj->isDisabled())
      continue;

    if (elapsed<pObj->getAbsStart()) {
      // BEFORE
      pObj->onTimerPre(elapsed, this);
    }
    else if (pObj->getAbsEnd()<elapsed) {
      // AFTER
      if (pObj->getState()==AnimObj::AO_PRE) {
        pObj->setState(AnimObj::AO_ACTIVE);
        pObj->onStart(elapsed, this);
        pObj->setState(AnimObj::AO_POST);
        pObj->onEnd(elapsed, this);
      }
      else if (pObj->getState()==AnimObj::AO_ACTIVE) {
        pObj->setState(AnimObj::AO_POST);
        pObj->onEnd(elapsed, this);
      }
      pObj->onTimerPost(elapsed, this);
    }
    else {
      // ACTIVE
      if (pObj->getState()==AnimObj::AO_PRE) {
        pObj->setState(AnimObj::AO_ACTIVE);
        pObj->onStart(elapsed, this);
      }
      pObj->onTimer(elapsed, this);
    }
  }

  // MB_DPRINTLN("%d q=%s", int(elapse), m_pWorkCam->m_rotQuat.m_data.toString().c_str());
  if (!m_pTgtView.isnull())
    m_pTgtView->setCamera(m_pWorkCam);
}

bool AnimMgr::onTimer(double t, qlib::time_value curr, bool bLast)
{
  // qlib::time_value curr = m_pEvMgr->getCurrentTime();
  //MB_DPRINTLN("time %ld, %lf", (curr-m_timeStart), t);

  qlib::time_value elapsed = curr-m_timeStart; 

  onTimerImpl(elapsed);

  if (bLast) {
    m_timeStart = 0;
    m_timeEnd = 0;
    m_nState = AM_STOP;
    m_timeElapsed = 0;
    if (m_loop)
      start(m_pTgtView);
    else
      m_pTgtView = ViewPtr();
    return false;
  }
  return true;
}

void AnimMgr::sceneChanged(SceneEvent &ev)
{
  if (m_pTgtView.isnull())
    return;

  if (ev.getType()==SceneEvent::SCE_VIEW_REMOVING) {
    // target view is removing --> stop anim
    if (ev.getTarget()==m_pTgtView->getUID()) {
      stop();
      m_pTgtView = ViewPtr();
    }
  }
}

void AnimMgr::clear()
{
  if (m_nState!=AM_STOP) {
    stop();
    m_pTgtView = ViewPtr();
  }
  m_data.clear();
  m_timeElapsed = 0;
}

AnimObjPtr AnimMgr::getAt(int index) const
{
  return m_data.at(index);
}

AnimObjPtr AnimMgr::getByName(const LString & name) const
{
  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    if (pObj->getName().equals(name))
      return pObj;
  }
  return AnimObjPtr();
}

void AnimMgr::appendImpl(AnimObjPtr pAnimObj)
{
  // append to the anim list data
  m_data.push_back(pAnimObj);

  // Listen for the property event of pAnimObj
  pAnimObj->addPropListener(this);
}

void AnimMgr::append(AnimObjPtr pAnimObj)
{
  int index = m_data.size();

  appendImpl(pAnimObj);

  MB_DPRINTLN("AnimMgr.append appended to %d", index);

  update();

  // Setup undo info
  UndoUtil uu(m_nTgtSceneID);
  if (uu.isOK()) {
    AnimObjEditInfo *pInfo = MB_NEW AnimObjEditInfo();
    pInfo->m_nTgtSceID = m_nTgtSceneID;
    pInfo->m_nMode = AnimObjEditInfo::AOE_ADD;
    pInfo->m_nIndex = index;
    pInfo->m_pAnimObj = pAnimObj;
    uu.add(pInfo);
  }
  
  // Fire qsys scriptable event (SEM_ANIM)
  AnimObjEvent ev;
  ev.setDescr("animObjAdded");
  ev.setSource(m_nTgtSceneID);
  ev.setType(ScrEventManager::SEM_ADDED);
  ev.setIndex(index);
  fireEvent(ev);
}

void AnimMgr::insertBefore(int ind, AnimObjPtr pAnimObj)
{
  if (ind>=m_data.size() || ind<0) {
    append(pAnimObj);
    return;
  }

  data_t::iterator iter = m_data.begin()+ind;
  m_data.insert(iter, pAnimObj);

  int index = ind;
  MB_DPRINTLN("AnimMgr.insertBefore inserted to %d", index);

  update();

  // Setup undo info
  UndoUtil uu(m_nTgtSceneID);
  if (uu.isOK()) {
    AnimObjEditInfo *pInfo = MB_NEW AnimObjEditInfo();
    pInfo->m_nTgtSceID = m_nTgtSceneID;
    pInfo->m_nMode = AnimObjEditInfo::AOE_ADD;
    pInfo->m_nIndex = index;
    pInfo->m_pAnimObj = pAnimObj;
    uu.add(pInfo);
  }

  // Fire qsys scriptable event (SEM_ANIM)
  AnimObjEvent ev;
  ev.setDescr("animObjAdded");
  ev.setSource(m_nTgtSceneID);
  ev.setType(ScrEventManager::SEM_ADDED);
  ev.setIndex(index);
  fireEvent(ev);

  // Listen for the property event of pAnimObj
  pAnimObj->addPropListener(this);
}

bool AnimMgr::removeAt(int ind)
{
  if (ind>=m_data.size())
    return false;

  data_t::iterator iter = m_data.begin()+ind;
  if (iter==m_data.end())
    return false;

  // Fire qsys scriptable event (SEM_ANIM)
  AnimObjEvent ev;
  ev.setDescr("animObjRemoving");
  ev.setSource(m_nTgtSceneID);
  ev.setType(ScrEventManager::SEM_REMOVING);
  ev.setIndex(ind);
  fireEvent(ev);

  AnimObjPtr pAnimObj = *iter;

  // Unlisten for the property event of pAnimObj
  pAnimObj->removePropListener(this);

  m_data.erase(iter);

  update();
  
  // Setup undo info
  UndoUtil uu(m_nTgtSceneID);
  if (uu.isOK()) {
    AnimObjEditInfo *pInfo = MB_NEW AnimObjEditInfo();
    pInfo->m_nTgtSceID = m_nTgtSceneID;
    pInfo->m_nMode = AnimObjEditInfo::AOE_REMOVE;
    pInfo->m_nIndex = ind;
    pInfo->m_pAnimObj = pAnimObj;
    uu.add(pInfo);
  }

  return true;
}

void AnimMgr::fireEvent(AnimObjEvent &ev)
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->fireEvent(ev);
}

/// update internal data structure after editing
void AnimMgr::update()
{
  if (m_nState!=AM_STOP) {
    // edited but running -> abort the play
    stop();
  }

  try {
    resolveRelTime();
  }
  catch (...) {
  }

  // adj total length
  qlib::time_value len = 0;
  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    //qlib::time_value st = pObj->getAbsStart();
    qlib::time_value en = pObj->getAbsEnd();
    if (en>len)
      len = en;
  }
  if (m_length!=len) {
    MB_DPRINTLN("AnimMgr.update> duration autochange %d", int(len));
    m_length = len;
  }
}

////////////////////////////////////////////////////

/// Serialize this scene to the stream
void AnimMgr::writeTo2(qlib::LDom2Node *pNode) const
{
  super_t::writeTo2(pNode);

  // Write AnimObjects in this mgr
  data_t::const_iterator oiter = m_data.begin();
  for (; oiter!=m_data.end(); ++oiter) {
    AnimObjPtr obj = *oiter;

    qlib::LDom2Node *pChNode = pNode->appendChild();
    pChNode->setTagName("motion");
    pChNode->setTypeNameByObj(obj.get());
    obj->writeTo2(pChNode);
  }

}

/// Serialize this scene to the localfile
void AnimMgr::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    LString type_name = pChNode->getTypeName();

    if (tag.equals("motion") && !type_name.isEmpty()) {
      AnimObjPtr pAnimObj = pChNode->createObjByTypeNameT<AnimObj>();
      // AnimObj's properties should be built before the registration to the AnimMgr
      //   to prevent event propargation.
      pAnimObj->readFrom2(pChNode);

      // Register the built AnimObj 
      //  (Here we cannot use this.append(), since we must avoid generating any events.
      appendImpl(pAnimObj);
    }
  }
}

int AnimMgr::setupRender(const qlib::LScrTime &t_start,
                         const qlib::LScrTime &t_end,
                         double frame_rate)
{
  qlib::time_value tv_st = t_start.getValue();
  qlib::time_value tv_en = t_end.getValue();

  //double dt = 1000.0/frame_rate;
  double dt = 1000000000.0/frame_rate;

  int if_st = int( ::ceil(double(tv_st)*frame_rate/1000000000.0) );
  int if_en = int( ::floor(double(tv_en)*frame_rate/1000000000.0) );
  int nframes = if_en-if_st+1;

  m_delt = dt;
  m_nStartFrame = if_st;
  m_nEndFrame = if_en;
  m_nCurrFrame = if_st;

  startImpl();

  return nframes;
}

/// Write single frame using the SceneExporter
void AnimMgr::writeFrame(qlib::LScrSp<SceneExporter> pWriter)
{
  if (m_nCurrFrame>m_nEndFrame)
    return; // error (eof reached)

  qlib::time_value curt = qlib::time_value(::floor(double(m_nCurrFrame)*m_delt));
  MB_DPRINTLN("Write frame %d (%f ms)", m_nCurrFrame, double(curt)/1000000.0);

  ScenePtr pScene = getTgtScene();
  pWriter->attach(pScene);
  onTimerImpl(curt);
  pWriter->setCamera(m_pWorkCam);
  pWriter->write();
  pWriter->detach();

  ++m_nCurrFrame;
}

qlib::uid_t AnimMgr::getRootUID() const
{
  return m_uid;
}
    
void AnimMgr::propChanged(qlib::LPropEvent &aEvent)
{
  qlib::LPropSupport *pTgtTmp = aEvent.getTarget();

  AnimObj *pAnimObj = dynamic_cast<AnimObj *>(pTgtTmp);
  if (pAnimObj!=NULL) {

    MB_DPRINTLN("AnimObj(%s) prop (%s) changed",
		pAnimObj->getName().c_str(),
		aEvent.getName().c_str());

    // update animmgr's data structure
    update();

    // Record undo/redo info
    UndoUtil uu(m_nTgtSceneID);
    if (uu.isOK()) {
      PropEditInfo *pInfo = MB_NEW PropEditInfo();
      pInfo->setup(pAnimObj->getUID(), aEvent);
      uu.add(pInfo);
    }

    // Fire qsys scriptable event (SEM_ANIM)
    AnimObjEvent ev;
    ev.setDescr("animObjPropChanged");
    ev.setSource(m_nTgtSceneID);
    ev.setType(ScrEventManager::SEM_PROPCHG);
    ev.setDescr(aEvent.getName());
    ev.setPropEvent(&aEvent);
    // ev.setIndex(ind);
    fireEvent(ev);

    return;
  }

  AnimMgr *pAnimMgr = dynamic_cast<AnimMgr *>(pTgtTmp);
  if (pAnimMgr==NULL)
    return;

  // TO DO: handle anim-mgr propevent
  MB_DPRINTLN("AnimMgr prop (%s) changed",
	      aEvent.getName().c_str());

}

/// Resolve relative start/end times
void AnimMgr::resolveRelTime()
{
  // set resolution flag
  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    pObj->setTimeResolved(false);
  }

  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    BOOST_FOREACH (AnimObjPtr pObj2, m_data) {
      pObj2->setMarked(false);
    }
    resolveTimeImpl(pObj);
  }
}

void AnimMgr::resolveTimeImpl(AnimObjPtr pObj)
{
  if (pObj->isTimeResolved())
    return;

  if (pObj->isMarked()) {
    LString msg = LString::format("AnimMgr.resolve failed: AnimObj <%s> cyclic ref", pObj->getName().c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  LString ref = pObj->getTimeRefName();
  if (ref.isEmpty()) {
    // no ref obj --> rel==abs time specification
    pObj->setAbsStart( pObj->getRelStart() );
    pObj->setAbsEnd( pObj->getRelEnd() );
    pObj->setTimeResolved(true);
    return;
  }
    
  AnimObjPtr pRefObj;
  BOOST_FOREACH (AnimObjPtr pObj, m_data) {
    if (ref.equals(pObj->getName())) {
      pRefObj = pObj;
      break;
    }
  }

  if (pRefObj.isnull()) {
    LString msg = LString::format("AnimMgr.resolve failed: AnimObj <%s> not found", ref.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  if (pRefObj->isTimeResolved()) {
    time_value tv_st = pRefObj->getAbsStart();
    time_value tv_en = pRefObj->getAbsEnd();
    pObj->setAbsStart(tv_en + pObj->getRelStart());
    pObj->setAbsEnd(tv_en + pObj->getRelEnd());
    pObj->setTimeResolved(true);
    return;
  }

  // refObj's time is not resolved yet!!

  pObj->setMarked(true);
  resolveTimeImpl(pRefObj);

  if (!pRefObj->isTimeResolved()) {
    LString msg = LString::format("AnimMgr.resolve failed: AnimObj <%s> resolve failed", ref.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  time_value tv_st = pRefObj->getAbsStart();
  time_value tv_en = pRefObj->getAbsEnd();
  pObj->setAbsStart(tv_en + pObj->getRelStart());
  pObj->setAbsEnd(tv_en + pObj->getRelEnd());
  pObj->setTimeResolved(true);
}

