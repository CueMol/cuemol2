//
//  EAGLView.m
//  CueMol
//
//  Created by user on 11/11/26.
//  Copyright 2011 __MyCompanyName__. All rights reserved.
//

#include <common.h>

#import <QuartzCore/QuartzCore.h>

#import "EAGLView.h"

@interface EAGLView (PrivateMethods)
- (void)createFramebuffer;
- (void)deleteFramebuffer;
@end

@implementation EAGLView

@dynamic context;

- (int)getWidth
{
  // return _nWidth;
  return framebufferWidth;
}

- (int)getHeight
{
  // return _nHeight;
  return framebufferHeight;
}

/*- (void)awakeFromNib
{
  [self becomeFirstResponder];
  }*/

// You must implement this method
+ (Class)layerClass
{
  return [CAEAGLLayer class];
}

//The EAGL view is stored in the nib file. When it's unarchived it's sent -initWithCoder:.
- (id)initWithCoder:(NSCoder*)coder
{
  self = [super initWithCoder:coder];
  if (self) {
    CAEAGLLayer *eaglLayer = (CAEAGLLayer *)self.layer;
    
    eaglLayer.opaque = TRUE;
    eaglLayer.drawableProperties = [NSDictionary dictionaryWithObjectsAndKeys:
						   [NSNumber numberWithBool:FALSE], kEAGLDrawablePropertyRetainedBacking,
						 kEAGLColorFormatRGBA8, kEAGLDrawablePropertyColorFormat,
						 nil];
  }
  
  // [self becomeFirstResponder];
  return self;
}

// Touch handling, tile selection, and menu/pasteboard.
- (BOOL)canBecomeFirstResponder
{
  return YES;
}

- (void)dealloc
{
  [self deleteFramebuffer];    
  [context release];
    
  [super dealloc];
}

- (EAGLContext *)context
{
  return context;
}

- (void)setContext:(EAGLContext *)newContext
{
  if (context == newContext)
    return;

  [self deleteFramebuffer];
  
  [context release];
  context = [newContext retain];
  
  [EAGLContext setCurrentContext:nil];
}

- (void)createFramebuffer
{
  if (!context || defaultFramebuffer)
    return; // invalid context or already created

  [EAGLContext setCurrentContext:context];
  
  // Create default framebuffer object.
  glGenFramebuffers(1, &defaultFramebuffer);
  glBindFramebuffer(GL_FRAMEBUFFER, defaultFramebuffer);
  
  // Create color render buffer and allocate backing store.
  glGenRenderbuffers(1, &colorRenderbuffer);
  glBindRenderbuffer(GL_RENDERBUFFER, colorRenderbuffer);
  [context renderbufferStorage:GL_RENDERBUFFER fromDrawable:(CAEAGLLayer *)self.layer];
  glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_WIDTH, &framebufferWidth);
  glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_HEIGHT, &framebufferHeight);
  
  NSLog(@"EAGL> view width=%d height=%d", framebufferWidth, framebufferHeight);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, colorRenderbuffer);
  
  //  Add depth buffer
  glGenRenderbuffers(1, &depthRenderbuffer);
  glBindRenderbuffer(GL_RENDERBUFFER, depthRenderbuffer);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, 
			    GL_RENDERBUFFER, depthRenderbuffer );
  glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT16, 
			framebufferWidth, framebufferHeight );
  
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
    NSLog(@"Failed to make complete framebuffer object %x", glCheckFramebufferStatus(GL_FRAMEBUFFER));

}

- (void)deleteFramebuffer
{
  if (!context)
    return ; // context not initialized

  [EAGLContext setCurrentContext:context];
  
  if (defaultFramebuffer) {
    glDeleteFramebuffers(1, &defaultFramebuffer);
    defaultFramebuffer = 0;
  }
  
  if (colorRenderbuffer) {
    glDeleteRenderbuffers(1, &colorRenderbuffer);
    colorRenderbuffer = 0;
  }
  
  if (depthRenderbuffer) {
    glDeleteRenderbuffers(1, &depthRenderbuffer);
    depthRenderbuffer = 0;
  }
}

- (void)setFramebuffer
{
  if (!context)
    return; // context not initialized

  [EAGLContext setCurrentContext:context];
    
  if (!defaultFramebuffer)
    [self createFramebuffer];
  
  glBindFramebuffer(GL_FRAMEBUFFER, defaultFramebuffer);
}

- (BOOL)presentFramebuffer
{
  BOOL success = FALSE;
    
  if (context) {
    [EAGLContext setCurrentContext:context];
    
    glBindRenderbuffer(GL_RENDERBUFFER, colorRenderbuffer);
    
    success = [context presentRenderbuffer:GL_RENDERBUFFER];
  }
    
  return success;
}

- (void)layoutSubviews
{
  // The framebuffer will be re-created at the beginning of the next setFramebuffer method call.
  [self deleteFramebuffer];
}

@end
