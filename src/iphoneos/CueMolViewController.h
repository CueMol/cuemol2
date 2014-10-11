//
//  CueMolViewController.h
//  CueMol
//
//  Created by user on 11/11/26.
//  Copyright 2011 __MyCompanyName__. All rights reserved.
//

#import <UIKit/UIKit.h>

#import <OpenGLES/EAGL.h>

#import <OpenGLES/ES1/gl.h>
#import <OpenGLES/ES1/glext.h>
#import <OpenGLES/ES2/gl.h>
#import <OpenGLES/ES2/glext.h>

@class EAGLView;

@interface CueMolViewController : UIViewController
{
  UINavigationBar *m_uiNavBar;

  UIToolbar *m_uiToolBar;

  EAGLContext *context;
  // GLuint program;
  
  // BOOL animating;
  // NSInteger animationFrameInterval;
  // CADisplayLink *displayLink;
  
  void *_pView;
  int _nSceneID;
  int _nViewID;

  // CGPoint _prevPoint;
  CGFloat _startZoom;
  CGFloat _prevRot;
  int _nIniTouch;
  BOOL _panStarted;

  float _cenTmpX;
  float _cenTmpY;
  float _cenTmpZ;
  BOOL _cenTmpOK;
}

// @property (readonly, nonatomic, getter=isAnimating) BOOL animating;
// @property (nonatomic) NSInteger animationFrameInterval;
// - (void)startAnimation;
// - (void)stopAnimation;

@end

@interface CueMolViewController (Cpp)
- (void *)initializeQmView:(EAGLView *)pEAGLView;
- (void)finalizeQmView;
- (void)callDrawScene;

- (void)handleSingleDoubleTap:(id)sender;
- (void)handlePanGesture:(id)sender;
- (void)handlePinchGesture:(id)sender;
- (void)handleSwipeGesture:(id)sender;
- (void)handleRotateGesture:(id)sender;
- (void)handleLongPressGesture:(id)sender;

- (void) openFile:(NSString*)path fileExt:(NSString*)fext;

@end

