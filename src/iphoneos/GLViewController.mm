// -*-Mode: objc;-*-
//
//  GLViewController.m
//  CueMol OpenGLES view controller
//

#include <common.h>

#import <QuartzCore/QuartzCore.h>

#import "GLViewController.hpp"
#import "DisplayViewController.hpp"
#import "EAGLView.h"

@implementation GLViewController

// @synthesize animating, context, displayLink;

- (void)loadView 
{
  m_dispViewController = [[DisplayViewController alloc] init];

  if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
    // Use popover UI (for iPad)
    m_displayPopover = [[UIPopoverController alloc] initWithContentViewController:m_dispViewController];
    m_displayPopover.delegate = self;
    //m_displayPopover.popoverContentSize = CGSizeMake(240., 320.);
  }
  else {
    // Navigation view UI (for iPhone)
    m_displayPopover = nil;
  }

  /////////////////////
  // Create GLES context
  //
#ifdef USE_GLES2
  EAGLContext *aContext = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES2];
#else
  EAGLContext *aContext = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES1];
#endif
    
  if (!aContext)
    NSLog(@"Failed to create ES context");
  else if (![EAGLContext setCurrentContext:aContext])
    NSLog(@"Failed to set ES context current");
    
  m_pContext = aContext;
  [aContext release];
	
  // Create EAGLView
  CGRect applicationFrame = [[UIScreen mainScreen] applicationFrame];
  EAGLView *pEAGLView = [[EAGLView alloc] initWithFrame:applicationFrame];

  self.view = pEAGLView;

  [pEAGLView setContext:m_pContext];
  [pEAGLView setFramebuffer];
    
  _panStarted = FALSE;

  [self createGestureRecognizers];

  [self initializeQmView];

  [pEAGLView release];
}

- (void)viewDidLoad
{
}

- (void)dealloc
{
  [self finalizeQmView];

  // Tear down context.
  if ([EAGLContext currentContext] == m_pContext)
    [EAGLContext setCurrentContext:nil];
    
  [m_pContext release];
  //[m_pPlayBtn release];
    
  [super dealloc];
}

- (void)didReceiveMemoryWarning
{
    // Releases the view if it doesn't have a superview.
    [super didReceiveMemoryWarning];
    
    // Release any cached data, images, etc. that aren't in use.
}

#define kToolbarHeight 48

-(void)viewDidAppear:(BOOL)animated
{
  //UINavigationBar *pNavBar = self.navigationController.navigationBar;
  UINavigationItem *pNavItem  = self.navigationItem; //[pNavBar topItem];

  if (pNavItem.rightBarButtonItem==nil) {
    UIBarButtonItem *dispBtnItem = 
      [[UIBarButtonItem alloc] initWithTitle:@"Display"
			       style:UIBarButtonItemStyleBordered
			       target:self
			       action:@selector(clickDispBtn:)];
    pNavItem.rightBarButtonItem = dispBtnItem;
    [dispBtnItem release];
  }

  //////////

  //NSLog(@"View size: %@", NSStringFromCGSize(self.view.frame.size));
  if (m_pToolbar==nil) {
    CGRect bounds = [[UIScreen mainScreen] applicationFrame];
    CGRect toolbarFrame = CGRectMake(0, bounds.size.height - kToolbarHeight,
				     bounds.size.width, kToolbarHeight);

    m_pToolbar = [[[UIToolbar alloc] initWithFrame:toolbarFrame] retain];
    m_pToolbar.barStyle = UIBarStyleBlack;
    m_pToolbar.translucent = YES;

    // Allow the image view to size as the orientation changes.
    // imageView.autoresizingMask = UIViewAutoresizingFlexibleHeight | UIViewAutoresizingFlexibleWidth;
    // self.toolbar = aToolbar;

    [self initAnimBarItems];
  
    // Allow the toolbar to size and float as the orientation changes.
    m_pToolbar.autoresizingMask =  UIViewAutoresizingFlexibleTopMargin | UIViewAutoresizingFlexibleWidth;
    //aToolbar.autoresizingMask =  UIViewAutoresizingFlexibleBottomMargin | UIViewAutoresizingFlexibleWidth;
  
    [self.view addSubview:m_pToolbar];
  }

  // initially, the tool bar is hidden.
  m_pToolbar.hidden = YES;
  [self updateAnimBarItems];

  // call superclass
  [super viewDidAppear:animated];
}

-(void)viewDidDisappear:(BOOL)animated
{
  [super viewDidDisappear:animated];
}

-(void)viewWillAppear:(BOOL)animated
{
  [super viewWillAppear:animated];
}

-(void)viewWillDisappear:(BOOL)animated
{
  // hide the disp popover, if shown
  if (m_displayPopover && m_displayPopover.popoverVisible)
    [m_displayPopover dismissPopoverAnimated:YES];

  // stop the UI-hide timer
  [self stopTimer];

  [super viewWillDisappear:animated];
}

/////////////////////////////////////////

- (void)initAnimBarItems
{
  m_pLoopButton = [[[UIBarButtonItem alloc]
		     initWithBarButtonSystemItem:UIBarButtonSystemItemRefresh
		     target:self action:@selector(onLoopBtn)] retain];
  
  m_pPlayButton = [[[UIBarButtonItem alloc]
			  initWithBarButtonSystemItem:UIBarButtonSystemItemPlay
			  target:self action:@selector(onPlayBtn)] retain];
  
  m_pPauseButton = [[[UIBarButtonItem alloc]
		      initWithBarButtonSystemItem:UIBarButtonSystemItemPause
		      target:self action:@selector(onPlayBtn)] retain];
  
  m_pRewButton = [[[UIBarButtonItem alloc]
		    initWithBarButtonSystemItem:UIBarButtonSystemItemRewind
		    target:self action:@selector(onRewBtn)] retain];
  
  m_pSpcBtn = [[[UIBarButtonItem alloc]
		 initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace
		 target:nil action:nil] retain];

  m_pFixBtn = [[[UIBarButtonItem alloc]
		 initWithBarButtonSystemItem:UIBarButtonSystemItemFixedSpace
		 target:nil action:nil] retain];
  m_pFixBtn.width = 20;

}

- (void)createGestureRecognizers
{

  ////
  {
    UITapGestureRecognizer *recog =
      [[UITapGestureRecognizer alloc]
	initWithTarget:self action:@selector(handleDoubleTap:)];
    
    recog.numberOfTapsRequired = 2;
    [self.view addGestureRecognizer:recog];
    [recog release];
  }
  ////
  {
    UITapGestureRecognizer *recog =
      [[UITapGestureRecognizer alloc]
	initWithTarget:self action:@selector(handleSingleTap:)];
    
    recog.numberOfTapsRequired = 1;
    // This also allow sending touch events to the view (and subviews, including the buttons)
    recog.cancelsTouchesInView = NO;
    [self.view addGestureRecognizer:recog];
    [recog release];
  }
  ////

  UIPanGestureRecognizer *panGesture = [[UIPanGestureRecognizer alloc]
					 initWithTarget:self action:@selector(handlePanGesture:)];
  //panGesture.minimumNumberOfTouches = 2;
  panGesture.maximumNumberOfTouches = 3;
  [self.view addGestureRecognizer:panGesture];
  [panGesture release];

  ////

  UIPinchGestureRecognizer *pinchGesture = [[UIPinchGestureRecognizer alloc]
					     initWithTarget:self action:@selector(handlePinchGesture:)];
  [self.view addGestureRecognizer:pinchGesture];
  [pinchGesture release];
  
  ////

  UIRotationGestureRecognizer *rotateGesture = [[UIRotationGestureRecognizer alloc]
						 initWithTarget:self action:@selector(handleRotateGesture:)];
  [self.view addGestureRecognizer:rotateGesture];
  [rotateGesture release];

  ////

  /*
  UILongPressGestureRecognizer *longPressGesture = [[UILongPressGestureRecognizer alloc]
						     initWithTarget:self action:@selector(handleLongPressGesture:)];
  [self.view addGestureRecognizer:longPressGesture];
  [longPressGesture release];
  */

  /*
  ////

  UISwipeGestureRecognizer *swipeGesture = [[UISwipeGestureRecognizer alloc]
					     initWithTarget:self action:@selector(handleSwipeGesture:)];
  swipeGesture.direction = UISwipeGestureRecognizerDirectionRight|UISwipeGestureRecognizerDirectionLeft|UISwipeGestureRecognizerDirectionUp|UISwipeGestureRecognizerDirectionDown;
  swipeGesture.numberOfTouchesRequired = 2;
  [self.view addGestureRecognizer:swipeGesture];
  [swipeGesture release];
  */

}

- (void)clickDispBtn:(id)sender
{
  UIBarButtonItem *btn = (UIBarButtonItem *)sender;

  if (!m_displayPopover) {
    // iPhone impl
    if (!self.navigationController) {
      NSLog(@"Navigation controller is NULL!!");
      return;
    }
    // Back button of the next navigation view should be set here.
    UIBarButtonItem *temporaryBarButtonItem = [[UIBarButtonItem alloc] init];
    temporaryBarButtonItem.title = @"Back";
    self.navigationItem.backBarButtonItem = temporaryBarButtonItem;
    [temporaryBarButtonItem release];

    [m_dispViewController setupWithSceneID:_nSceneID];
    [self.navigationController pushViewController:m_dispViewController animated:YES];
  }
  else {
    // iPad impl (using popover)
    if (m_displayPopover.popoverVisible) {
      // hide the disp popover
      [m_displayPopover dismissPopoverAnimated:YES];
      
      // restart auto-hide timer
      [self showUI];
    }
    else {
      // show the disp popover
      // re-initialize the disppopover by sceneID
      [m_dispViewController setupWithSceneID:_nSceneID];
      
      // Present the popover from the button that was tapped in the detail view.
      [m_displayPopover presentPopoverFromBarButtonItem:btn
		      permittedArrowDirections:UIPopoverArrowDirectionAny
			animated:YES];
      
      // prevent auto-hide of UI
      [self stopTimer];
    }
  }
}

/////////////

- (void)closeCtxtMenu
{
  UIMenuController *theMenu = [UIMenuController sharedMenuController];
  [theMenu setMenuVisible:NO animated:YES];
}

- (void)onTimer: (id)timer
{
  [self hideUI];
  [self stopTimer];
}

- (void)stopTimer
{
  if (m_pTimer!=nil) {
    [m_pTimer invalidate];
    NSLog(@"timer retain %d", [m_pTimer retainCount]);
    [m_pTimer release];
    m_pTimer = nil;
  }
}

- (void)showUI
{ 
  self.navigationController.navigationBar.translucent = YES;
  self.navigationController.navigationBar.barStyle = UIBarStyleBlackTranslucent;
  [self.navigationController setNavigationBarHidden:NO animated:YES];

  m_pToolbar.hidden = NO;

  [self stopTimer];
  NSTimer *pTimer = [NSTimer scheduledTimerWithTimeInterval: 5.0
			     target: self
			     selector: @selector(onTimer:)
			     userInfo: nil
			     repeats: NO];
  m_pTimer = [pTimer retain];
}

- (void)hideUI
{
  [self.navigationController setNavigationBarHidden:YES animated:YES];
  m_pToolbar.hidden = YES;
}

- (void)popoverControllerDidDismissPopover:(UIPopoverController *)popoverController
{
  [self showUI];
}

@end
