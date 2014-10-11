//
//  CueMolViewController.m
//  CueMol
//
//  Created by user on 11/11/26.
//  Copyright 2011 __MyCompanyName__. All rights reserved.
//

#import <QuartzCore/QuartzCore.h>

#import "CueMolViewController.h"
#import "EAGLView.h"

@interface CueMolViewController ()
// @property (nonatomic, retain) EAGLContext *context;
// @property (nonatomic, assign) CADisplayLink *displayLink;

- (void)createGestureRecognizers;
@end

@implementation CueMolViewController

// @synthesize animating, context, displayLink;

- (void)clickBack
{
}

- (void)awakeFromNib
{
  //m_uiToolBar = [[UIToolbar alloc] initWithFrame:CGRectMake(0.0f, 0.0f, self.view.frame.size.width, 44.0f)];
  //m_uiToolBar.autoresizingMask = UIViewAutoresizingFlexibleWidth;
  //m_uiToolBar.tintColor = [UIColor blackColor];
  //[self.view addSubview:m_uiToolBar];

  /*
  CGRect navrect = CGRectMake(0.0f, 0.0f, self.view.frame.size.width, 44.0f); //self.view.frame;
  m_uiNavBar = [[UINavigationBar alloc] initWithFrame:navrect];
  UINavigationItem* title = [[UINavigationItem alloc] initWithTitle:@"Title"];
  UIBarButtonItem* btnItemBack =
    [[UIBarButtonItem alloc] initWithTitle:@"Back"
			     style:UIBarButtonItemStyleBordered
			     target:self action:@selector(clickBack:)];
  title.rightBarButtonItem = btnItemBack;
  [m_uiNavBar pushNavigationItem:title animated:YES];
  [self.view addSubview:m_uiNavBar];
  [title release];
  [btnItemBack release];
  */

  //EAGLContext *aContext = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES2];
  //if (!aContext) {
  //aContext = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES1];
  //}

  EAGLContext *aContext = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES1];
    
  if (!aContext)
    NSLog(@"Failed to create ES context");
  else if (![EAGLContext setCurrentContext:aContext])
    NSLog(@"Failed to set ES context current");
    
  context = aContext;
  [aContext release];
	
  EAGLView *pEAGLView = (EAGLView *)self.view;
  [pEAGLView setContext:context];
  [pEAGLView setFramebuffer];
    
  //if ([context API] == kEAGLRenderingAPIOpenGLES2)
  //[self loadShaders];
    
  // animating = FALSE;
  // animationFrameInterval = 1;
  // self.displayLink = nil;

  _panStarted = FALSE;

  [self createGestureRecognizers];

  _pView = [self initializeQmView:pEAGLView];
}

/*// Implement loadView to create a view hierarchy programmatically, without using a nib.
- (void)loadView 
{
}*/

- (void)dealloc
{
  [self finalizeQmView];

  //if (program) {
  //  glDeleteProgram(program);
  //  program = 0;
  //}
    
  // Tear down context.
  if ([EAGLContext currentContext] == context)
    [EAGLContext setCurrentContext:nil];
    
  [context release];
    
  [super dealloc];
}


//- (NSInteger)animationFrameInterval
//{
//    return animationFrameInterval;
//}

- (void)setAnimationFrameInterval:(NSInteger)frameInterval
{
}

- (void)startAnimation
{
}

- (void)stopAnimation
{
}

- (void)drawFrame
{
  [(EAGLView *)self.view setFramebuffer];
  [self callDrawScene];
    
  [(EAGLView *)self.view presentFramebuffer];
}

- (void)didReceiveMemoryWarning
{
    // Releases the view if it doesn't have a superview.
    [super didReceiveMemoryWarning];
    
    // Release any cached data, images, etc. that aren't in use.
}

- (void)createGestureRecognizers
{
  ////

  UITapGestureRecognizer *singleFingerDoubleTap =
    [[UITapGestureRecognizer alloc]
      initWithTarget:self action:@selector(handleSingleDoubleTap:)];

  singleFingerDoubleTap.numberOfTapsRequired = 2;
  [self.view addGestureRecognizer:singleFingerDoubleTap];
  [singleFingerDoubleTap release];

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

  UILongPressGestureRecognizer *longPressGesture = [[UILongPressGestureRecognizer alloc]
						     initWithTarget:self action:@selector(handleLongPressGesture:)];
  [self.view addGestureRecognizer:longPressGesture];
  [longPressGesture release];

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

@end
