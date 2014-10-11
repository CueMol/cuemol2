//
// LWViewer services implementation
//

#include <common.h>
#include "LWViewerManager.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/LChar.hpp>
#include <qsys/Scene.hpp>
#include <qsys/anim/AnimMgr.hpp>

#include "LWObject.hpp"
#include "LWRenderer.hpp"

#ifndef QM_BUILD_LW
#  include <qsys/style/AutoStyleCtxt.hpp>
#  include <qsys/StreamManager.hpp>
#  include <qsys/SceneXMLWriter.hpp>
#  include "LWRendDisplayContext.hpp"
#endif

SINGLETON_BASE_IMPL(lwview::LWViewerManager);

using namespace lwview;

LWViewerManager::LWViewerManager()
{
  MB_DPRINTLN("LWViewerManager(%p) created", this);
}

LWViewerManager::~LWViewerManager()
{
  MB_DPRINTLN("LWViewerManager(%p) destructed", this);
}

///////////////

using qsys::Scene;
using qsys::Camera;
using qsys::CameraPtr;
using qsys::ScenePtr;
using qsys::Object;
using qsys::ObjectPtr;
using qsys::Renderer;
using qsys::RendererPtr;
using qsys::AnimMgrPtr;

void LWViewerManager::convToLWScene(qsys::ScenePtr pScene, qsys::ScenePtr pNewScene)
{
#ifndef QM_BUILD_LW
  qsys::AutoStyleCtxt(pScene->getUID());

  Scene::ObjIter iter = pScene->beginObj();
  Scene::ObjIter eiter = pScene->endObj();

  std::deque<ObjectPtr> newobjs;
  LString objname, rendname;
  for (; iter!=eiter; ++iter) {
    ObjectPtr pObj = iter->second;
    LWObjPtr pNewObj(new LWObject);

    objname = pObj->getName();
    pNewObj->setName(objname);
    pNewObj->setDefaultPropFlag("name", false);
    if (!pObj->isVisible()) {
      pNewObj->setVisible(false);
      pNewObj->setDefaultPropFlag("visible", false);
    }
    pNewObj->startBuild();
    
    Object::RendIter riter = pObj->beginRend();
    Object::RendIter reiter = pObj->endRend();
    for (; riter!=reiter; ++riter) {
      RendererPtr pRend = riter->second;

      // ignore selection renderer
      if (qlib::LChar::equals(pRend->getTypeName(), "*selection"))
        continue;

      LWRendPtr pNewRend = pNewObj->createRenderer("lwrend");

      // set name
      rendname = pRend->getName();
      if (rendname.isEmpty())
        rendname = LString("(") + pRend->getTypeName() + LString(")");
      pNewRend->setName(rendname);
      pNewRend->setDefaultPropFlag("name", false);

      if (!pRend->isVisible()) {
        pNewRend->setVisible(false);
        pNewRend->setDefaultPropFlag("visible", false);
      }

      // Set Data ID of LWRend
      pNewRend->setDataID(pNewRend->getUID());
      pNewRend->setDefaultPropFlag("data_id", false);
      
      LWRendDisplayContext *pdc = MB_NEW LWRendDisplayContext();

      pdc->init(pNewRend.get(), pNewObj.get());
      pdc->setAlpha(pRend->getDefaultAlpha());
      pdc->startRender();
      pdc->startSection(objname+":"+rendname);

      pRend->display(pdc);
	  pRend->displayLabels(pdc);

      pdc->endSection();
      pdc->endRender();

      // make hittest data
      if (pRend->isHitTestSupported()) {
        pdc->startHit(pRend->getUID());
        pRend->displayHit(pdc);
        pdc->endHit();
      }

      delete pdc;
    }

    pNewObj->endBuild();
    newobjs.push_back(pNewObj);
  }

  BOOST_FOREACH (ObjectPtr pElem, newobjs) {
    pNewScene->addObject(pElem);
  }

  // copy camera settings
  Scene::CameraIter citer = pScene->beginCamera();
  Scene::CameraIter eciter = pScene->endCamera();
  for (; citer!=eciter; ++citer) {
    // we should set the copy of camera to the new scene.
    // (getCamera always returns the copy of camera)
    LString name = citer->first;
    CameraPtr pCam = pScene->getCamera(name);
    // force embed
    pCam->setSource(LString());
    pNewScene->setCamera(name, pCam);
  }

  // copy animation settings
  copyAnim(pScene, pNewScene);

#endif
}

void LWViewerManager::copyAnim(qsys::ScenePtr pScene, qsys::ScenePtr pNewScene)
{
#ifndef QM_BUILD_LW

  AnimMgrPtr pSrc = pScene->getAnimMgr();

  if (pSrc->getSize()==0 && pSrc->getLength()==0)
    return;

  qlib::LDom2Node *pNode = MB_NEW qlib::LDom2Node();
  pNode->setTagName("animation");
  pSrc->writeTo2(pNode);

  AnimMgrPtr pDst = pNewScene->getAnimMgr();
  pDst->readFrom2(pNode);

  delete pNode;

#endif
}
