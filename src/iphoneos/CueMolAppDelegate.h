// -*-Mode: objc;-*-
//
//  CueMolAppDelegate.h
//  CueMol
//
//  Created by user on 11/11/26.
//  Copyright 2011 __MyCompanyName__. All rights reserved.
//

#import <UIKit/UIKit.h>

@class GLViewController;
@class FileViewController;

@interface CueMolAppDelegate : NSObject <UIApplicationDelegate>
{
  /// main window
  UIWindow *window;

  /// file selection view
  FileViewController *_fileViewController;

  /// mol scene view
  GLViewController *_glViewController;

  /// root view controller
  UINavigationController *viewController;
}

@property (nonatomic, retain) UIWindow *window;
//@property (nonatomic, retain) GLViewController *viewController;
@property (nonatomic, retain) UINavigationController *viewController;
@property (nonatomic, retain) FileViewController *_fileViewController;

-(void) enterScene:(NSString*)path filetype:(NSString*)filetype title:(NSString*)aTitle;

@end
