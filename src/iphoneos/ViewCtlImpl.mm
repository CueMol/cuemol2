// -*-Mode: objc;-*-
//
// GLViewController implementation (C++ interface part)
//

#include <common.h>
#include <qsys/SceneManager.hpp>
#include <qsys/Scene.hpp>
#include <qsys/View.hpp>
#include <qsys/ViewInputConfig.hpp>

#include <qsys/StreamManager.hpp>
#include <qsys/ObjReader.hpp>
#include <qsys/Renderer.hpp>
#include <qsys/SceneXMLReader.hpp>

// adhoc JSON parsing
#include <qlib/LRegExpr.hpp>

#import "GLViewController.hpp"
#import "EAGLView.h"
#import "IosTimerImpl.hpp"
#import "IosQmView.hpp"
#import "CueMolAppDelegate.h"
#import "FileViewController.hpp"

#include <qsys/anim/AnimMgr.hpp>
#include <modules/anim/SimpleSpin.hpp>

using namespace sysdep;

@implementation GLViewController(Cpp)

//////////////////////////////////////////////////
// initialization & finalization

- (void)initializeQmView
{
  MB_DPRINTLN("setupQmView called");

  // Change config for iPhone/iPad UI
  qsys::ViewInputConfig *pVic = qsys::ViewInputConfig::getInstance();
  pVic->applyStyle("IphoneViewInConf");
  pVic->setHitPrec(30.0 * self.sclFac);

  m_bUseAdhocAnim = false;
  m_adhocSpinSpeed = 5*1000;

  if (_nSceneID==0)
    [self createSceneAndView];

  ////////////
  // setup timer impl
  IosTimerImpl *pTimer = new IosTimerImpl;
  qlib::EventManager::getInstance()->initTimer(pTimer);

}

- (void)finalizeQmView
{
  // cleanup timer
  qlib::EventManager::getInstance()->finiTimer();

  [self destroySceneAndView];

  // IosQmView *pGLES1View = (IosQmView *) _pView;
  // delete pGLES1View;
}

//////////////////////////////////////////////////

- (void)createSceneAndView
{
  EAGLView *pEAGLView = (EAGLView *)self.view;

  // Create new scene
  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->createScene();

  // Create new view
  qsys::ViewPtr pView = pScene->createView();

  qsys::View *ptmp = pView.get();
  IosQmView *pES1View = dynamic_cast<IosQmView *>(ptmp);
  MB_ASSERT(pES1View!=NULL);

  pES1View->setup(pEAGLView);

  _nViewID = pView->getUID();
  _nSceneID = pScene->getUID();
  _pView = pES1View;

  // set default view props
  NSUserDefaults *pref = [NSUserDefaults standardUserDefaults];

  // momentum scroll config
  bool bScrAnim = true;
  NSNumber* nsScrAnim = [pref objectForKey:@"scroll_anim"];
  if (nsScrAnim)
    bScrAnim = ([nsScrAnim boolValue]==YES);
  pView->setTransMMS(bScrAnim);
  pView->setRotMMS(bScrAnim);

  // adhoc spin config
  NSNumber* spin_speed = [pref objectForKey:@"adhoc_spin_speed"];
  if (spin_speed) {
    m_adhocSpinSpeed = [spin_speed intValue] * 1000;
    if (m_adhocSpinSpeed<=100) {
      MB_DPRINTLN("ERROR adhoc spin speed %d is too small!!", int(m_adhocSpinSpeed));
      m_adhocSpinSpeed = 5*1000;
    }
  }
}

- (void)destroySceneAndView
{
  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->getScene(_nSceneID);
  if (pScene.isnull()) {
    LOG_DPRINTLN("destroySceneAndView() ERROR: Invalid scnid %d", _nSceneID);
    return;
  }

  // cleanup the scene
  pScene->clearAllData();

  // destroy the view
  pScene->destroyView(_nViewID);

  // destroy the scene
  pScMgr->destroyScene(_nSceneID);

  _nViewID = qlib::invalid_uid;
  _nSceneID = qlib::invalid_uid;
  _pView = NULL;
}

/////////////

- (void)handlePanGesture:(id)sender
{
  [self closeCtxtMenu];
  // [self hideUI];

  UIPanGestureRecognizer *pan = (UIPanGestureRecognizer*)sender;
  CGPoint point = [pan locationInView:self.view];
  CGPoint velocity = [pan velocityInView:self.view];
  NSUInteger numtch = [pan numberOfTouches];

  // scale to the pixle
  point.x *= self.sclFac;
  point.y *= self.sclFac;
  velocity.x *= self.sclFac;
  velocity.y *= self.sclFac;

  //NSLog(@"pan. translation: %@, velocity: %@", NSStringFromCGPoint(point), NSStringFromCGPoint(velocity));

  IosQmView *pIosQmView = (IosQmView *) _pView;

  switch (pan.state) {
  case UIGestureRecognizerStatePossible:
    break;
   
  case UIGestureRecognizerStateBegan:
    _panStarted = TRUE;
    _nIniTouch = numtch;
    LOG_DPRINTLN("panStart (%f,%f) %d", point.x, point.y, numtch);
    pIosQmView->panStart(_nIniTouch, point.x, point.y);
    break;

  case UIGestureRecognizerStateChanged:
    // MB_DPRINTLN("panMove (%.2f,%.2f) v=(%.2f,%.2f) %d", point.x, point.y, velocity.x, velocity.y, numtch);
    if (!_panStarted)
      break;
    if (numtch==_nIniTouch) {
      pIosQmView->panMove(_nIniTouch, point.x, point.y);
    }
    else {
      // another finger was touched or leaved
      pIosQmView->panEnd(_nIniTouch,
			 point.x, point.y,
			 velocity.x, velocity.y);
      _panStarted = FALSE;
    }
    break;

  case UIGestureRecognizerStateEnded:
    if (!_panStarted)
      break;
    LOG_DPRINTLN("panEnd (%.2f,%.2f) v=(%.2f,%.2f) %d", point.x, point.y, velocity.x, velocity.y, numtch);
    pIosQmView->panEnd(_nIniTouch,
		       point.x, point.y,
		       velocity.x, velocity.y);
    break;

  case UIGestureRecognizerStateCancelled:
    printf("Cancelled\n");
    break;
   
  case UIGestureRecognizerStateFailed:
    printf("Failed\n");
    break;
   
    //case UIGestureRecognizerStateRecognized:
    //break;
  }
}

- (void)handlePinchGesture:(id)sender
{
  [self closeCtxtMenu];
  // [self hideUI];

  UIPinchGestureRecognizer *pinch = (UIPinchGestureRecognizer*)sender;
  CGFloat scale = [pinch scale];
  // CGFloat velocity = [pinch velocity];
  // NSLog(@"pinch. scale: %f, velocity: %f", scale, velocity);

  if (scale<1e-3) {
    // scale is too small!!
    return;
  }
  scale = 1.0/scale;

  IosQmView *pIosQmView = (IosQmView *) _pView;
  if (pIosQmView==NULL) return;

  switch (pinch.state) {
  case UIGestureRecognizerStatePossible:
    break;
  case UIGestureRecognizerStateBegan:
    _startZoom = (CGFloat) pIosQmView->getZoom();
    pIosQmView->setZoom(scale * _startZoom);
    pIosQmView->setUpProjMat(-1, -1);
    MB_DPRINTLN("START zoom=%f, scale=%f", _startZoom, scale);
    break;

  case UIGestureRecognizerStateChanged:
    pIosQmView->setZoom(scale * _startZoom);
    pIosQmView->setUpProjMat(-1, -1);
    break;

  case UIGestureRecognizerStateEnded:
    break;
  case UIGestureRecognizerStateCancelled:
    break;
  case UIGestureRecognizerStateFailed:
    break;
  }
}

- (void)handleRotateGesture:(id)sender
{
  [self closeCtxtMenu];
  // [self hideUI];

  UIRotationGestureRecognizer *rotate = (UIRotationGestureRecognizer*)sender;
  CGFloat rotation = [rotate rotation];
  //CGFloat velocity = [rotate velocity];
  //NSLog(@"rotate. rotation: %f, velocity: %f", rotation, velocity);

  IosQmView *pIosQmView = (IosQmView *) _pView;
  if (pIosQmView==NULL) return;

  switch (rotate.state) {
  case UIGestureRecognizerStatePossible:
    break;
  case UIGestureRecognizerStateBegan:
    pIosQmView->rotateView(0.0, 0.0, qlib::toDegree(double(rotation)));
    _prevRot = rotation;
    MB_DPRINTLN("START rot=%f", qlib::toDegree(double(rotation)) );
    break;

  case UIGestureRecognizerStateChanged: {
    CGFloat dth = (rotation - _prevRot) * 4.0f;
    pIosQmView->rotateView(0.0, 0.0, qlib::toDegree(double(dth)));
    _prevRot = rotation;
    break;
  }

  case UIGestureRecognizerStateEnded:
    break;
  case UIGestureRecognizerStateCancelled:
    break;
  case UIGestureRecognizerStateFailed:
    break;
  }
}

static qsys::AnimMgrPtr getAnimMgr(qlib::uid_t _nSceneID, qlib::uid_t _nViewID)
{
  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->getScene(_nSceneID);
  if (pScene.isnull())
    return qsys::AnimMgrPtr();

  return pScene->getAnimMgr();
}

- (void)handleSingleTap:(id)sender
{
  UITapGestureRecognizer *rcg = (UITapGestureRecognizer*)sender;
  CGPoint point = [rcg locationInView:self.view];

  // scale to the pixle
  point.x *= self.sclFac;
  point.y *= self.sclFac;

  LOG_DPRINTLN("Single Tap (%f,%f)\n", point.x, point.y);

  [self closeCtxtMenu];
  [self showUI];

  qsys::AnimMgrPtr pAM = getAnimMgr(_nSceneID, _nViewID);
  if (pAM.isnull())
    return;
  int nstate = pAM->getPlayState();
  if (nstate == qsys::AnimMgr::AM_RUNNING) {
    pAM->pause();
    [self updateAnimBarItems];
  }

  IosQmView *pIosQmView = (IosQmView *) _pView;
  if (pIosQmView==NULL) return;
  pIosQmView->cancelMomentumScroll();
}

- (void)handleDoubleTap:(id)sender
{
  UITapGestureRecognizer *rcg = (UITapGestureRecognizer*)sender;
  CGPoint point = [rcg locationInView:self.view];

  // scale to the pixel unit
  CGPoint pixel;
  pixel.x = point.x * self.sclFac;
  pixel.y = point.y * self.sclFac;

  LOG_DPRINTLN("Double Tap (%f,%f)\n", pixel.x, pixel.y);

  IosQmView *pIosQmView = (IosQmView *) _pView;
  if (pIosQmView==NULL) return;

  // [self showUI];

  LString hit = pIosQmView->hitTest(int(pixel.x), int(pixel.y));
  pIosQmView->drawScene();
  LOG_DPRINTLN("hittest: %s", hit.c_str());
  
  if (hit.isEmpty()) return;

  LString msg, stmp;
  double dtmp;
  _cenTmpOK = false;
  for (;;) {
    qlib::LRegExpr re;
    re.setPattern("\"message\"\\s*:\\s*\"([^\"]*)\"");
    if (re.match(hit) && re.getSubstrCount()>=(1+1))
      msg = re.getSubstr(1+0);

    re.setPattern("\"x\"\\s*:\\s*([0-9\\.\\+\\-]+)");
    if (re.match(hit) && re.getSubstrCount()>=(1+1)) {
      stmp = re.getSubstr(1+0);
      if (!stmp.toDouble(&dtmp))
	break;
      _cenTmpX = dtmp;
    }    

    re.setPattern("\"y\"\\s*:\\s*([0-9\\.\\+\\-]+)");
    if (re.match(hit) && re.getSubstrCount()>=(1+1)) {
      stmp = re.getSubstr(1+0);
      if (!stmp.toDouble(&dtmp))
	break;
      _cenTmpY = dtmp;
    }    

    re.setPattern("\"z\"\\s*:\\s*([0-9\\.\\+\\-]+)");
    if (re.match(hit) && re.getSubstrCount()>=(1+1)) {
      stmp = re.getSubstr(1+0);
      if (!stmp.toDouble(&dtmp))
	break;
      _cenTmpZ = dtmp;
    }    

    _cenTmpOK = true;
    break;
  }
  MB_DPRINTLN("message: %s", msg.c_str());
  MB_DPRINTLN("CenOK: %d (%f,%f,%f)", _cenTmpOK, _cenTmpX, _cenTmpY, _cenTmpZ);

  //NSString *sMsg = [NSString stringWithUTF8String: msg.c_str() ];
  NSString *sMsg = [[NSString alloc] initWithUTF8String:(msg.c_str()) ];

  UIMenuController *theMenu = [UIMenuController sharedMenuController];

  UIMenuItem *labelMenuItem = [[UIMenuItem alloc] initWithTitle:sMsg action:@selector(dummyAction:)];
  UIMenuItem *centerMenuItem = [[UIMenuItem alloc] initWithTitle:@"Center here" action:@selector(doCenterHere:)];
        
  [self.view becomeFirstResponder];
  //[theMenu setArrowDirection:UIMenuControllerArrowLeft];
  [theMenu setMenuItems:[NSArray arrayWithObjects:labelMenuItem, centerMenuItem, nil]];
  [theMenu setTargetRect:CGRectMake(point.x, point.y, 0, 0) inView:[rcg view]];
  [theMenu setMenuVisible:YES animated:YES];
  [labelMenuItem release];
  [centerMenuItem release];

  [sMsg release];
}

// not used
- (void)handleSwipeGesture:(id)sender
{
  [self closeCtxtMenu];
  // [self hideUI];
  NSLog(@"swipe");
}

// not used
- (void)handleLongPressGesture:(id)sender
{
  /*
  [self closeCtxtMenu];
  NSLog(@"Long press.");
  UIGestureRecognizer *ges = (UIGestureRecognizer*)sender;
  
  if (ges.state==UIGestureRecognizerStateBegan)
    [self showUI];
  */
}

//////////

- (BOOL)shouldAutorotateToInterfaceOrientation: (UIInterfaceOrientation)orientation
{
  // notify orientation change
  IosQmView *pIosQmView = (IosQmView *) _pView;
  if (pIosQmView==NULL) return YES;
  pIosQmView->setUpdateFlag();
  return YES;
}

///////////////////

- (void)dummyAction:(UIMenuController *)controller
{
}

- (void)doCenterHere:(UIMenuController *)controller
{
  if (_cenTmpOK) {
    Vector4D vcen(_cenTmpX, _cenTmpY, _cenTmpZ);

    IosQmView *pIosQmView = (IosQmView *) _pView;
    if (pIosQmView==NULL) return;
    
    pIosQmView->setViewCenterAnim(vcen);
  }
}

void showErrMsg(GLViewController *pSelf, const LString &amsg)
{
  NSString *msg;
  if (amsg.isEmpty())
    msg = @"Cannot open file: unknown error.";
  else
    msg = [[[NSString alloc] initWithUTF8String:(amsg.c_str()) ] autorelease];
  UIAlertView *alert = [[[UIAlertView alloc]
			  initWithTitle: @"Error"
			  message: msg
			  delegate: pSelf
			  cancelButtonTitle: @"OK"
			  otherButtonTitles: nil] autorelease];
  [alert show];
}

- (void)alertView:(UIAlertView *)alertView
didDismissWithButtonIndex:(NSInteger)buttonIndex
{
  // cancel the openFile() call, after user have pushed the OK button
  [self.navigationController popViewControllerAnimated:YES];
}

- (BOOL) openFile:(NSString*)path fileExt:(NSString*)fext title:(NSString*)aTitle
{
  NSLog(@"Open file: %@ ext %@", path, fext);
  LString srcpath( [path UTF8String] );
  LString srcext;
  if (srcpath.toLowerCase().endsWith(".qsl.pdb")) {
    // XXX: support for safari&nrlab hp
    srcext = "qsl";
  }
  else {
    srcext = LString ( [fext UTF8String] );
  }

  // check absolute path
  if (!qlib::isAbsolutePath(srcpath)) {
    // relative to app bundle
    NSString *path1 = [[NSBundle mainBundle] pathForResource:path ofType:@""];
    if (!path1) {
      LString msg = LString::format("file not found: %s", srcpath.c_str());
      showErrMsg(self, msg);
      return NO;
    }
    
    srcpath = [path1 UTF8String];
  }

  LString title;
  if (aTitle!=nil)
    title = [aTitle UTF8String];
  else
    title = qlib::getLeafName(srcpath);

  qsys::StreamManager *pSM = qsys::StreamManager::getInstance();
  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->getScene(_nSceneID);
  if (pScene.isnull()) {
    [self createSceneAndView];
    pScene = pScMgr->getScene(_nSceneID);
    if (pScene.isnull()) {
      LString msg = LString::format("openFile() ERROR 1: Invalid Scene ID %d", _nSceneID);
      showErrMsg(self, msg);
      return NO;
    }
  }
  else if (!pScene->isJustCreated()) {
    MB_DPRINTLN("openFile() scene is already loaded");

    // destroy current scene
    [self destroySceneAndView];

    // make another scene
    [self createSceneAndView];
    pScene = pScMgr->getScene(_nSceneID);

    if (pScene.isnull()) {
      LString msg = LString::format("openFile() ERROR 2: Invalid Scene ID %d", _nSceneID);
      showErrMsg(self, msg);
      return NO;
    }
  }

  qsys::ViewPtr pView = pScene->getView(_nViewID);
  qsys::ObjectPtr pObj;

  if (srcext.equalsIgnoreCase("pdb")) {
    if (title.isEmpty())
      title = "PDB";

    try {
      qsys::ObjReaderPtr pReader = pSM->createHandler("pdb", 0);
      pReader->setPath(srcpath);
      pObj = pReader->createDefaultObj();
      pReader->attach(pObj);
      pReader->read();
      pReader->detach();
      pObj->setName(title);
      pScene->addObject(pObj);
      if (pScene->getName().isEmpty())
	pScene->setName(title);
    }
    catch (qlib::LException &e) {
      LString strErrMsg = e.getMsg();
      LOG_DPRINTLN("ERROR: %s", strErrMsg.c_str());
      showErrMsg(self, strErrMsg);
      return NO;
    }
    catch (...) {
      LOG_DPRINTLN("ERROR: Unknown exception occured");
      LString strErrMsg = "Unknown exception occured";
      showErrMsg(self, strErrMsg);
      return NO;
    }

    if (pObj.isnull()) {
      showErrMsg(self, LString());
      return NO;
    }
    
    try {
      qsys::RendererPtr pRend = pObj->createRenderer("simple");
      pRend->applyStyles("DefaultCPKColoring");
      pRend->setName("simple0");
      qlib::Vector4D vcen = pRend->getCenter();
      pView->setViewCenter(vcen);
    }
    catch (qlib::LException &e) {
      LString strErrMsg = e.getMsg();
      LOG_DPRINTLN("ERROR: %s", strErrMsg.c_str());
      showErrMsg(self, strErrMsg);
      return NO;
    }
    catch (...) {
      LOG_DPRINTLN("ERROR: Unknown exception occured");
      LString strErrMsg = "Unknown exception occured";
      showErrMsg(self, strErrMsg);
      return NO;
    }

  }
  else if (srcext.equalsIgnoreCase("qsl")) {

    try {
      qsys::SceneXMLReaderPtr pReader = pSM->createHandler("qsc_xml", 3);
      pReader->setPath(srcpath);
      pReader->attach(pScene);
      pReader->read();
      pReader->detach();
    }
    catch (qlib::LException &e) {
      LString strErrMsg = e.getMsg();
      LOG_DPRINTLN("ERROR: %s", strErrMsg.c_str());
      showErrMsg(self, strErrMsg);
      return NO;
    }
    catch (...) {
      LOG_DPRINTLN("ERROR: Unknown exception occured");
      LString strErrMsg = "Unknown exception occured";
      showErrMsg(self, strErrMsg);
      return NO;
      //return false;
    }

    pScene->loadViewFromCam(_nViewID, "__current");
    if (pScene->getName().isEmpty())
      pScene->setName(title);
  }

  {
    // load OK --> add to the file list
    if (title.isEmpty())
      title = "(noname)";
    NSString *nsname = [[NSString alloc] initWithUTF8String:(title.c_str())];
    NSString *nspath = [[NSString alloc] initWithUTF8String:(srcpath.c_str())];
    CueMolAppDelegate *app = [[UIApplication sharedApplication] delegate];
    [app._fileViewController addNewEntry:nsname path:nspath filetype:fext];

    // update view's title
    self.title = nsname;
  }

  {
    // setup default spin animation, if the scene doesn't contain animations
    qsys::AnimMgrPtr pAM = pScene->getAnimMgr();
    if (pAM->getSize()==0) {
      m_bUseAdhocAnim = true;
      pAM->setLength(qlib::time_value(m_adhocSpinSpeed));
      pAM->setStartCamName("__current");
      qlib::LScrSp<anim::SimpleSpin> pAnim = qlib::LScrSp<anim::SimpleSpin>(new anim::SimpleSpin());
      pAnim->setStart(0);
      pAnim->setEnd(m_adhocSpinSpeed);
      pAnim->setAngle(360.0);
      pAnim->setAxis(qlib::Vector4D(0,1,0));
      pAM->append(pAnim);
      pAM->setLoop(true);
    }
  }

  return YES;
}

- (IBAction)onPlayBtn
{
  NSLog(@"OnPlayBtn called!!!!!");
  [self showUI];

  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->getScene(_nSceneID);
  if (pScene.isnull())
    return;

  qsys::ViewPtr pView = pScene->getView(_nViewID);
  if (pView.isnull())
    return;

  qsys::AnimMgrPtr pAM = pScene->getAnimMgr();
  if (pAM.isnull())
    return;

  if (pAM->getSize()==0)
    return;

  int nstate = pAM->getPlayState();
  switch (nstate) {
  default:
  case qsys::AnimMgr::AM_PAUSED: 
  case qsys::AnimMgr::AM_STOP: {
    if (m_bUseAdhocAnim) {
      // in the ad-hoc animation mode, the start camera is always the current view position
      pScene->saveViewToCam(_nViewID, "__current");
      pAM->stop();
    }
    
    pAM->start(pView);
    break;
  }

  case qsys::AnimMgr::AM_RUNNING: {
    pAM->pause();
    break;
  }
  }

  [self updateAnimBarItems];
}

- (IBAction)onRewBtn
{
  NSLog(@"OnRewBtn called!!!!!");
  [self showUI];

  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->getScene(_nSceneID);
  if (pScene.isnull())
    return;

  qsys::ViewPtr pView = pScene->getView(_nViewID);
  if (pView.isnull())
    return;

  qsys::AnimMgrPtr pAM = pScene->getAnimMgr();
  if (pAM.isnull())
    return;

  if (pAM->getSize()==0)
    return;

  pAM->goTime(qlib::time_value(0), pView);
  pAM->stop();

  [self updateAnimBarItems];
}

- (IBAction)onLoopBtn
{
  [self showUI];

  qsys::AnimMgrPtr pAM = getAnimMgr(_nSceneID, _nViewID);
  if (pAM.isnull())
    return;

  pAM->setLoop(!pAM->isLoop());

  [self updateAnimBarItems];
}

- (void)updateAnimBarItems
{
  qsys::AnimMgrPtr pAM = getAnimMgr(_nSceneID, _nViewID);
  if (pAM.isnull())
    return;

  bool isloop = pAM->isLoop();
  bool playing = pAM->getPlayState()==qsys::AnimMgr::AM_RUNNING;

  if (isloop)
    m_pLoopButton.style = UIBarButtonItemStyleDone;
  else
    m_pLoopButton.style = UIBarButtonItemStyleBordered;

  if (playing) {
    m_pToolbar.items = [NSArray arrayWithObjects: m_pLoopButton, m_pSpcBtn,
				m_pRewButton, m_pFixBtn, m_pPauseButton, nil];
  }
  else {
    m_pToolbar.items = [NSArray arrayWithObjects: m_pLoopButton, m_pSpcBtn,
				m_pRewButton, m_pFixBtn, m_pPlayButton, nil];
  }
}


@end

