// -*-Mode: ObjC;-*-
//
//  EAGLView.h
//  CueMol view GLES implementation
//

#import <UIKit/UIKit.h>

#ifdef USE_GLES2
#  import <OpenGLES/ES2/gl.h>
#  import <OpenGLES/ES2/glext.h>
#else
#  import <OpenGLES/ES1/gl.h>
#  import <OpenGLES/ES1/glext.h>
#endif

// This class wraps the CAEAGLLayer from CoreAnimation into a convenient UIView subclass.
// The view content is basically an EAGL surface you render your OpenGL scene into.
// Note that setting the view non-opaque will only work if the EAGL surface has an alpha channel.

@interface EAGLView : UIView
{
@private
  EAGLContext *context;
  
  // The pixel dimensions of the CAEAGLLayer.
  GLint framebufferWidth;
  GLint framebufferHeight;
  
  // The OpenGL ES names for the framebuffer and renderbuffer used to render to this view.
  GLuint defaultFramebuffer, colorRenderbuffer, depthRenderbuffer;
  
  // int _nWidth;
  // int _nHeight;
}

@property (nonatomic, retain) EAGLContext *context;
						   
- (void)setContext:(EAGLContext *)newContext;
- (void)setFramebuffer;
- (BOOL)presentFramebuffer;
- (int)getWidth;
- (int)getHeight;

@end
