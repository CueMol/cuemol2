//
//  main.m
//  CueMol
//
//  Created by user on 11/11/26.
//  Copyright 2011 __MyCompanyName__. All rights reserved.
//

#import <UIKit/UIKit.h>

#import "ios_main.h"

int main(int argc, char *argv[])
{
  NSString *sysconf_path;
  sysconf_path = [[NSBundle mainBundle] pathForResource:@"iosconfig" ofType:@"xml"];
  ios_init([sysconf_path UTF8String]);
  
  NSAutoreleasePool * pool = [[NSAutoreleasePool alloc] init];
  int retVal = UIApplicationMain(argc, argv, nil, @"CueMolAppDelegate");
  [pool release];

  ios_fini();

  return retVal;
}
