// -*-Mode: objc;-*-

#include <common.h>
#include <qsys/SceneManager.hpp>
#include <qsys/Scene.hpp>
#include <qsys/Object.hpp>
#include <qsys/Renderer.hpp>
#include <qsys/Camera.hpp>

#import "DisplayViewController.hpp"
#import "CueMolAppDelegate.h"

@implementation DisplayViewController

//@synthesize menuList, myTableView, myModalViewController;

- (id)init
{
  m_nSceneID = 0;
  return [super init];
}

- (void)dealloc
{
  [m_tableView release];
  //[m_fileList release];

  [super dealloc];
}

- (void)viewDidLoad
{
  self.title = @"Display";
		
  m_tableView=[[UITableView alloc] initWithFrame:CGRectMake(0,0,1,1) style:UITableViewStyleGrouped];
  CGRect rect = self.view.frame;
  rect.origin.x = rect.origin.y = 0;
  [m_tableView setFrame:rect];
  [m_tableView setDelegate:self];                     
  [m_tableView setDataSource:self];
  [self.view addSubview:m_tableView];
  
  m_tableView.autoresizingMask= 
    UIViewAutoresizingFlexibleRightMargin| 
    UIViewAutoresizingFlexibleTopMargin|
    UIViewAutoresizingFlexibleLeftMargin|
    UIViewAutoresizingFlexibleBottomMargin|
    UIViewAutoresizingFlexibleWidth|
    UIViewAutoresizingFlexibleHeight;

}

- (void)viewDidUnload
{
  // self.m_tableView = nil;
  // self.menuList = nil;
}

- (void)viewWillAppear:(BOOL)animated
{
  if (UI_USER_INTERFACE_IDIOM() != UIUserInterfaceIdiomPad) {
    // iPhone UI uses normal navigation bar
    self.navigationController.navigationBar.translucent = NO;
    self.navigationController.navigationBar.barStyle = UIBarStyleDefault;
    [self.navigationController setNavigationBarHidden:NO animated:YES];
  }
}

-(void)viewWillDisappear:(BOOL)animated
{
  NSLog(@"DispView will disappear");
  [super viewWillDisappear:animated];

  if (UI_USER_INTERFACE_IDIOM() != UIUserInterfaceIdiomPad) {
    // In the case of iPhone UI,
    // we should change to the transpalent NavBar here.
    [self.navigationController.topViewController showUI];
  }
}

- (BOOL)shouldAutorotateToInterfaceOrientation: (UIInterfaceOrientation)orientation
{
  return YES;
}

////////////////////////////////////////////////////////////
// table view delegation

//- (CGFloat)tableView:(UITableView*)tableView 
//heightForRowAtIndexPath:(NSIndexPath*)indexPath
//{
//  return 50;
//}

- (void)tableView:(UITableView*)tableView 
didSelectRowAtIndexPath:(NSIndexPath*)indexPath
{
  NSUInteger row = indexPath.row;
  NSUInteger section = indexPath.section;

  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->getScene(m_nSceneID);
  if (pScene.isnull())
    return;

  if (section==0) {
    // obj/rend
    NSMutableDictionary* obj = [m_objList objectAtIndex:row];
    NSString* nstype = [obj objectForKey:@"type"];
    NSNumber* nsvisible = [obj objectForKey:@"visible"];
    NSNumber* nsuid = [obj objectForKey:@"id"];

    qlib::uid_t uid = qlib::uid_t( [nsuid intValue] );
    bool bVisible = bool( [nsvisible boolValue] );

    if ([nstype isEqualToString:@"rend"]) {
      qsys::RendererPtr pRend = pScMgr->getRenderer(uid);
      if (!pRend.isnull())
	pRend->setVisible(!bVisible);
    }
    else {
      qsys::ObjectPtr pObj = pScMgr->getObject(uid);
      if (!pObj.isnull())
	pObj->setVisible(!bVisible);
    }

    pScene->setUpdateFlag();

    // update contents
    [obj setObject:[NSNumber numberWithBool:(!bVisible)] forKey:@"visible"];
    [m_tableView reloadData];
  }
  else {
    // camera
    NSDictionary* cam = [m_camList objectAtIndex:row];
    NSString* nsname = [cam objectForKey:@"name"];

    LString nm([nsname UTF8String]);

    if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
      // iPad
      pScene->setCamToViewAnim(qlib::invalid_uid, nm, true);
    }
    else {
      // iPhone
      // no animation
      pScene->setCamToViewAnim(qlib::invalid_uid, nm, false);
      // return to the GLView
      [self.navigationController popViewControllerAnimated:YES];
    }
  }

  // delselect selection in the table view
  [m_tableView deselectRowAtIndexPath:
		 [m_tableView indexPathForSelectedRow] animated:YES];
}

//- (void)tableView:(UITableView*)tableView 
//accessoryButtonTappedForRowWithIndexPath:(NSIndexPath*)indexPath {
//  [self tableView:tableView didSelectRowAtIndexPath:indexPath];
//}

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
  return 2;
}

// number of files in the table view
- (NSInteger)tableView:(UITableView*)tableView numberOfRowsInSection:(NSInteger)section
{
  if (section==0)
    return m_objList.count;
  else
    return m_camList.count;
}

// make cell in the table
- (UITableViewCell*)tableView:(UITableView*)tableView 
	cellForRowAtIndexPath:(NSIndexPath*)indexPath
{
  static NSString *kCellIdentifier = @"dispCellID";

  NSUInteger row = indexPath.row;
  NSUInteger section = indexPath.section;

  // make new table cell if needed
  UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:kCellIdentifier];
  if (cell==nil) {
    cell=[[[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault 
				   reuseIdentifier:kCellIdentifier] autorelease];
  }

  if (section==0) {
    NSDictionary* obj = [m_objList objectAtIndex:row];
    NSString* nsname = [obj objectForKey:@"name"];
    NSString* nstype = [obj objectForKey:@"type"];
    NSNumber* nsvisible = [obj objectForKey:@"visible"];

    if ([nsname length]==0) {
      [cell.textLabel setText:@"(noname)"];
    }
    else {
      [cell.textLabel setText:nsname];
    }
    // cell.textLabel.text = [NSString stringWithFormat:@"Row %i", row];

    // set indentation
    cell.indentationWidth = 16;
    if ([nstype isEqualToString:@"rend"]) {
      cell.indentationLevel = 1;
    }
    else {
      cell.indentationLevel = 0;
    }

    // set visibility
    if ([nsvisible boolValue]) {
      cell.accessoryType=UITableViewCellAccessoryCheckmark;
    }
    else {
      cell.accessoryType=UITableViewCellAccessoryNone;
    }
  }
  else {
    // camera row
    NSDictionary* cam = [m_camList objectAtIndex:row];
    NSString* nsname = [cam objectForKey:@"name"];
    [cell.textLabel setText:nsname];
    cell.indentationLevel = 0;
    cell.accessoryType=UITableViewCellAccessoryNone;
  }

  return cell;
}

- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section
{
  switch(section) {
  case 0:
    return @"Objects";
    break;
  case 1:
    return @"Camera";
    break;
  }
  return nil;
} 

- (void)setupWithSceneID:(int)nSceneID
{
  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  qsys::ScenePtr pScene = pScMgr->getScene(nSceneID);
  if (pScene.isnull()) {
    LOG_DPRINTLN("destroySceneAndView() ERROR: Invalid scnid %d", nSceneID);
    return;
  }

  NSMutableArray *objlist = [NSMutableArray array];
  int nobjs = 0;
  qsys::Scene::ObjIter oiter = pScene->beginObj();
  qsys::Scene::ObjIter oeiter = pScene->endObj();
  for (; oiter!=oeiter; ++oiter) {
    ++nobjs;
    qsys::ObjectPtr pObj = oiter->second;

    NSMutableDictionary *obj = [NSMutableDictionary dictionary];
    NSString *nsname = [ [NSString alloc] initWithUTF8String:(pObj->getName().c_str()) ];
    [obj setObject:nsname forKey:@"name"];
    [obj setObject:@"object" forKey:@"type"];
    [obj setObject:[NSNumber numberWithInt:(pObj->getUID())] forKey:@"id"];
    [obj setObject:[NSNumber numberWithBool:(pObj->isVisible())] forKey:@"visible"];
    [objlist addObject:obj];

    qsys::Object::RendIter riter = pObj->beginRend();
    qsys::Object::RendIter reiter = pObj->endRend();
    for (; riter!=reiter; ++riter) {
      qsys::RendererPtr pRend = riter->second;

      NSMutableDictionary *obj = [NSMutableDictionary dictionary];
      NSString *nsname = [ [NSString alloc] initWithUTF8String:(pRend->getName().c_str()) ];
      [obj setObject:nsname forKey:@"name"];
      [obj setObject:@"rend" forKey:@"type"];
      [obj setObject:[NSNumber numberWithInt:(pRend->getUID())] forKey:@"id"];
      [obj setObject:[NSNumber numberWithBool:(pRend->isVisible())] forKey:@"visible"];
      [objlist addObject:obj];
    }
  }

  m_objList = [objlist retain];

  //////////////////////////

  NSMutableArray *camlist = [NSMutableArray array];
  qsys::Scene::CameraIter citer = pScene->beginCamera();
  qsys::Scene::CameraIter ceiter = pScene->endCamera();
  for (; citer!=ceiter; ++citer) {
    qsys::CameraPtr pCam = citer->second;

    NSMutableDictionary *cam = [NSMutableDictionary dictionary];
    NSString *nsname = [ [NSString alloc] initWithUTF8String:(pCam->m_name.c_str()) ];
    [cam setObject:nsname forKey:@"name"];
    [camlist addObject:cam];
  }
  m_camList = [camlist retain];

  m_nSceneID = nSceneID;
  [m_tableView reloadData];
}

@end

 
