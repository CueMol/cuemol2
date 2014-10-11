//
//  GLViewController.h
//  CueMol
//
//  Created by user on 11/11/26.
//  Copyright 2011 __MyCompanyName__. All rights reserved.
//

#import <UIKit/UIKit.h>

#import <OpenGLES/EAGL.h>

#import <OpenGLES/ES1/gl.h>
#import <OpenGLES/ES1/glext.h>
//#import <OpenGLES/ES2/gl.h>
//#import <OpenGLES/ES2/glext.h>

@class EAGLView;
@class DisplayViewController;

@interface GLViewController : UIViewController <UIPopoverControllerDelegate, UIAlertViewDelegate>
{
  // The popover for use inside of the display control
  UIPopoverController *m_displayPopover;

  DisplayViewController *m_dispViewController;

  // UIButton *m_pPlayBtn;
  UIToolbar *m_pToolbar;
  UIBarButtonItem *m_pPlayButton, *m_pPauseButton, *m_pRewButton, *m_pLoopButton;
  UIBarButtonItem *m_pSpcBtn, *m_pFixBtn;

  // timer to hide UI
  NSTimer *m_pTimer;

  EAGLContext *m_pContext;
  // GLuint program;
  
  // BOOL animating;
  // NSInteger animationFrameInterval;
  // CADisplayLink *displayLink;
  
  int _nSceneID;
  int _nViewID;
  void *_pView;

  // CGPoint _prevPoint;
  CGFloat _startZoom;
  CGFloat _prevRot;
  int _nIniTouch;
  BOOL _panStarted;

  float _cenTmpX;
  float _cenTmpY;
  float _cenTmpZ;
  BOOL _cenTmpOK;

  bool m_bUseAdhocAnim;
  int m_adhocSpinSpeed;

  // CGFloat _sclFac;
}

/// view's point to pixel scale factor
@property (nonatomic) CGFloat sclFac;
@end

@interface GLViewController ()
- (void)createGestureRecognizers;
- (void)clickDispBtn:(id)sender;
- (void)onTimer:(id)timer;
- (void)stopTimer;
- (void)hideUI;
- (void)showUI;
- (void)closeCtxtMenu;
- (void)initAnimBarItems;
@end

@interface GLViewController (Cpp)
- (void)initializeQmView;
- (void)finalizeQmView;

- (void)createSceneAndView;
- (void)destroySceneAndView;

- (void)handleDoubleTap:(id)sender;
- (void)handleSingleTap:(id)sender;
- (void)handlePanGesture:(id)sender;
- (void)handlePinchGesture:(id)sender;
- (void)handleSwipeGesture:(id)sender;
- (void)handleRotateGesture:(id)sender;
- (void)handleLongPressGesture:(id)sender;

- (void)updateAnimBarItems;

- (BOOL)openFile:(NSString*)path fileExt:(NSString*)fext title:(NSString*)aTitle;
- (IBAction)onPlayBtn;
- (IBAction)onRewBtn;
- (IBAction)onLoopBtn;
@end
