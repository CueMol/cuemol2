//
//  CueMolAppDelegate.m
//  CueMol
//
//  Created by user on 11/11/26.
//  Copyright 2011 __MyCompanyName__. All rights reserved.
//

#import "CueMolAppDelegate.h"
#import "GLViewController.hpp"
#import "FileViewController.hpp"

@implementation CueMolAppDelegate

@synthesize window;
@synthesize viewController;
@synthesize _fileViewController;

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  //Initialize the application window
  window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
  if (!window)  {
    [self release];
    return NO;
  }
  window.backgroundColor = [UIColor blackColor];

  //viewController = [[GLViewController alloc] init];
  _glViewController = [[GLViewController alloc] init];
  _fileViewController = [[FileViewController alloc] init];
  // _fileViewController.title = @"Scene files";

  viewController = [[UINavigationController alloc] initWithRootViewController: _fileViewController];

  [window addSubview:viewController.view];

  [window makeKeyAndVisible];
  [window layoutSubviews];	

  [_fileViewController loadContent];

  // self.window.rootViewController = self.viewController;
  //[application setStatusBarStyle:UIStatusBarStyleDefault animated:NO];
  //[application setStatusBarHidden:NO withAnimation:YES];

  //CGFloat scl = 1.0;
  CGFloat scl = [UIScreen mainScreen].scale;
  NSLog(@"Screen scale factor= %f", scl);
  _glViewController.sclFac = scl;

  UIView *view = _glViewController.view;
  if ([view respondsToSelector:@selector(contentScaleFactor)]) {
    view.contentScaleFactor = scl;
  }

  return YES;
}

- (void)applicationDidFinishLaunching:(UIApplication *)application
{
  _glViewController.view.contentScaleFactor = [UIScreen mainScreen].scale;
}

- (BOOL)application:(UIApplication *)application handleOpenURL:(NSURL *)url
{
  if (url == nil)
    return NO;

  NSString *path = [url path];
  NSLog(@"OpenURL: %@", path);
  if (![url isFileURL])
    return NO;
  
  NSString *fext = [url pathExtension];

  // check the current view controller
  UIViewController *pCurVc = viewController.topViewController;
  if (pCurVc!=nil) {
    if ([[pCurVc class] isSubclassOfClass: [GLViewController class]]) {
      // GLView is shown --> just open the new file
      [_glViewController openFile:path fileExt:fext title:nil];
    }
    else if ([[pCurVc class] isSubclassOfClass: [FileViewController class]]) {
      // file view is shown
      [self enterScene:path filetype:fext title:nil];
    }
    else {
      // display view may be shown (iPhone UI)
      // --> cannot handle OpenURL
      return NO;
    }
  }

  return YES;
}

-(void) enterScene:(NSString*)path filetype:(NSString*)filetype title:(NSString*)aTitle
{
  if (UI_USER_INTERFACE_IDIOM() != UIUserInterfaceIdiomPad) {
    // Back button of the next navigation view should be set here.
    UIBarButtonItem *temporaryBarButtonItem = [[UIBarButtonItem alloc] init];
    temporaryBarButtonItem.title = @"Back";
    // The previous view controller is always fileViewController
    _fileViewController.navigationItem.backBarButtonItem = temporaryBarButtonItem;
    [temporaryBarButtonItem release];
  }

  [viewController pushViewController:_glViewController animated:YES];
  [viewController setNavigationBarHidden:YES animated:NO];

  // title will be set in the openFile method
  //if (aTitle!=nil)
  //_glViewController.title = aTitle;

  [_glViewController openFile:path fileExt:filetype title:aTitle];
}

- (void)applicationWillResignActive:(UIApplication *)application
{
  [_fileViewController saveContent];
  //[self.viewController stopAnimation];
}

- (void)applicationDidBecomeActive:(UIApplication *)application
{
  //[self.viewController startAnimation];
}

- (void)applicationWillTerminate:(UIApplication *)application
{
  [_fileViewController saveContent];
  //[self.viewController stopAnimation];
}

- (void)applicationDidEnterBackground:(UIApplication *)application
{
  // Handle any background procedures not related to animation here.
}

- (void)applicationWillEnterForeground:(UIApplication *)application
{
  // Handle any foreground procedures not related to animation here.
}

- (void)dealloc
{
  [viewController release];
  [window release];
    
  [super dealloc];
}

@end
