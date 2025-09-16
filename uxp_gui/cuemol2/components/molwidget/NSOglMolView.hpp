// -*-Mode: ObjC;-*-
//
// NSOglMolView: Cocoa OpenGL View ObjC++ class
//

//
// Custom view for OpenGL display
//
@interface NSOglMolView : NSOpenGLView
{
@private
  XPCNativeWidgetCocoa *mOwner;
  NSView *mParView;

  BOOL mIgnoreHittest;
  BOOL mEmulateRBtn;

  // MSAA related flags
  BOOL mMSAAEnabled;
  NSInteger mMSAASamples;

}

// MSAA flag setting
+ (void) setForceMSAA:(int)itry;
+ (int) getForceMSAA;

//
// OpenGL support
//
+ (NSOpenGLPixelFormat*) basicPixelFormat;
// MSAA support
+ (NSOpenGLPixelFormat*) pixelFormatWithMSAA:(BOOL)useMSAA samples:(NSInteger)samples;

// MSAA support methods
- (BOOL) isMSAAEnabled;
- (NSInteger) getMSAASamples;

- (void) prepareOpenGL;
- (id) initWithFrameAndOwner: (NSRect) frameRect
		       owner: (XPCNativeWidgetCocoa *) aOwner;

- (void) setParentView: (NSView *) aView;

- (NSView *)hitTest:(NSPoint)aPoint;

//
// Drawing
//
- (void) drawRect:(NSRect)rect;

//
// event handling
//
//- (void) mouseEntered:(NSEvent *)theEvent;
//- (void) mouseExited:(NSEvent *)theEvent;
- (void) mouseMoved:(NSEvent *)theEvent;

- (void) mouseDown:(NSEvent *)theEvent;
- (void) mouseUp:(NSEvent *)theEvent;
- (void) mouseDragged:(NSEvent *)theEvent;

- (void) rightMouseDown:(NSEvent *)theEvent;
- (void) rightMouseUp:(NSEvent *)theEvent;
- (void) rightMouseDragged:(NSEvent *)theEvent;

- (void) otherMouseDown:(NSEvent *)theEvent;
- (void) otherMouseUp:(NSEvent *)theEvent;
- (void) otherMouseDragged:(NSEvent *)theEvent;

////

-(void)magnifyWithEvent:(NSEvent *)anEvent;
-(void)rotateWithEvent:(NSEvent *)anEvent;
-(void)swipeWithEvent:(NSEvent *)anEvent;

- (BOOL) acceptsFirstResponder;
- (BOOL) becomeFirstResponder;
- (BOOL) resignFirstResponder;

- (void) setUpMouseEvent: (NSEvent *)theEvent pEvent: (void *)pEvent;

- (BOOL) getUseRbtnEmul;
@end

// MSAA related static var
static int sForceMSAA = 0;

@implementation NSOglMolView

// MSAA flag control support methods
+ (void) setForceMSAA:(int)itry
{
  sForceMSAA = itry;
  MB_DPRINTLN("sForceMSAA=%d", sForceMSAA);
}

+ (int) getForceMSAA
{
  return sForceMSAA;
}

// pixel format definition
+ (NSOpenGLPixelFormat*) basicPixelFormat
{
  // whether to try MSAA or not
  int tryMSAA = [NSOglMolView getForceMSAA];
  MB_DPRINTLN("TryMSAA=%d", tryMSAA);

  if (tryMSAA>0) {
    // Try MSAA pixel formats
    // NSInteger sampleCounts[] = {8, 4, 2, 0};
    NSInteger sampleCounts[] = {0, 2, 4, 8, 16};
    for (int i = tryMSAA; sampleCounts[i] > 0; i--) {
      NSOpenGLPixelFormat* pf = [NSOglMolView pixelFormatWithMSAA:YES samples:sampleCounts[i]];
      if (pf != nil) {
        LOG_DPRINTLN("NSOglMolView: MSAA enabled with %ld samples", (long)sampleCounts[i]);
        return pf;
      }
    }
    
    LOG_DPRINTLN("NSOglMolView: MSAA not available, falling back to non-MSAA");
  } else {
    LOG_DPRINTLN("NSOglMolView: MSAA forcibly disabled");
  }
  
  // Fallback to pixformat without MSAA
  return [NSOglMolView pixelFormatWithMSAA:NO samples:0];
}

+ (NSOpenGLPixelFormat*) pixelFormatWithMSAA:(BOOL)useMSAA samples:(NSInteger)samples
{
  NSMutableArray* attributes = [NSMutableArray array];
  
  // NSOpenGLPixelFormatAttribute attributes [] = {
  //   NSOpenGLPFAWindow,
  //   NSOpenGLPFADoubleBuffer,	// double buffered
  //   NSOpenGLPFADepthSize,
  //   (NSOpenGLPixelFormatAttribute) 16, // 16 bit depth buffer
  //   // NSOpenGLPFAMultisample,
  //   // NSOpenGLPFASampleBuffers, 1,
  //   // NSOpenGLPFASamples, 4,
  //   (NSOpenGLPixelFormatAttribute) 0
  // };
  // return [[[NSOpenGLPixelFormat alloc] initWithAttributes:attributes] autorelease];

  // Basic attributes
  [attributes addObject:@(NSOpenGLPFAWindow)];
  [attributes addObject:@(NSOpenGLPFADoubleBuffer)];
  [attributes addObject:@(NSOpenGLPFADepthSize)];
  [attributes addObject:@(16)]; // 16 bit depth buffer
  
  // Color buffer
  [attributes addObject:@(NSOpenGLPFAColorSize)];
  [attributes addObject:@(24)]; // 24-bit color
  [attributes addObject:@(NSOpenGLPFAAlphaSize)];
  [attributes addObject:@(8)]; // 8-bit alpha
  
  // Enable MSAA
  if (useMSAA && samples > 0) {
    [attributes addObject:@(NSOpenGLPFAMultisample)];
    [attributes addObject:@(NSOpenGLPFASampleBuffers)];
    [attributes addObject:@(1)];
    [attributes addObject:@(NSOpenGLPFASamples)];
    [attributes addObject:@(samples)];
  }
  
  // terminate attribute list
  [attributes addObject:@(0)];
  
  // convert NSArray to C array
  NSOpenGLPixelFormatAttribute* attributeArray = 
    (NSOpenGLPixelFormatAttribute*)calloc([attributes count], sizeof(NSOpenGLPixelFormatAttribute));
  
  for (NSUInteger i = 0; i < [attributes count]; i++) {
    attributeArray[i] = (NSOpenGLPixelFormatAttribute)[[attributes objectAtIndex:i] integerValue];
  }
  
  NSOpenGLPixelFormat* pixelFormat = 
    [[NSOpenGLPixelFormat alloc] initWithAttributes:attributeArray];
  
  free(attributeArray);
  
  return [pixelFormat autorelease];
}


- (id) initWithFrameAndOwner: (NSRect) frameRect
  owner: (XPCNativeWidgetCocoa *) aOwner
{
  mOwner = aOwner;
  mIgnoreHittest = NO;
  mEmulateRBtn = NO;

  // Init MSAA related flags
  mMSAAEnabled = NO;
  mMSAASamples = 0;

  //MB_DPRINT("initWithFramwAndOwner: owner=%p\n", mOwner);
  NSOpenGLPixelFormat * pf = [NSOglMolView basicPixelFormat];

  self = [super initWithFrame: frameRect pixelFormat: pf];
  // self = [super initWithFrame: frameRect];
  // NSOpenGLContext *ctxt = 
  //   [[[NSOpenGLContext alloc] initWithFormat:pf shareContext: share] autorelease];
  // [self setOpenGLContext: ctxt];

  // Show MSAA status
  if (self && pf) {
    GLint sampleBuffers = 0;
    GLint samples = 0;
    
    [pf getValues:&sampleBuffers forAttribute:NSOpenGLPFASampleBuffers forVirtualScreen:0];
    [pf getValues:&samples forAttribute:NSOpenGLPFASamples forVirtualScreen:0];
    
    if (sampleBuffers > 0 && samples > 0) {
      mMSAAEnabled = YES;
      mMSAASamples = samples;
      LOG_DPRINTLN("NSOglMolView: Created with MSAA (%ld samples)", (long)samples);
    } else {
      LOG_DPRINTLN("NSOglMolView: Created without MSAA");
    }
  }

  return self;
}

// set initial OpenGL state (current context is set)
// called after context is created
- (void) prepareOpenGL
{
  // set to vbl sync
  GLint swapInt = 1;
  [[self openGLContext] setValues:&swapInt forParameter:NSOpenGLCPSwapInterval];
}

- (void) setParentView: (NSView *) aView
{
  mParView = aView;
}

- (NSView *) hitTest: (NSPoint) aPoint
{
  // To generate DOM mouse event, the mouseMoved event is passed through to the nsChildView,
  // but the nsChildView::mouseMoved implementation always tries to find the correct responder
  // by calling hitTest() method, which will result in the infinite recursive calling
  // of NSOglMolView::mouseMoved method.
  // So we have to ignore the hit testing request by nsChildView in such the situation.
  // This is realized by checking the flag mIgnoreHittest which is set in NSOglMolView::mouseMoved
  // and returning the nextResponder, which presumably corresponds to the original nsChildView.
  if (mIgnoreHittest) {
    //MB_DPRINTLN("***XXX HITTEST");
    mIgnoreHittest = NO;
    return (NSView *) [self nextResponder];
  }
  else {
    //return nil;
    return [super hitTest: aPoint];
  }
}

- (void) drawRect: (NSRect) rect
{		
  if (mOwner) 
    mOwner->doRedrawGL();

  return;
}

////////////////////////////////////////
// Mouse events

- (void)mouseMoved:(NSEvent *)theEvent
{
  if (mOwner) {
    //qsys::InDevEvent ev;
    //[self setUpMouseEvent: theEvent pEvent: &ev];
    //mOwner->resetCursor();
  }

  //MB_DPRINTLN("MouseMove called %f, %f!!", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  mIgnoreHittest = YES;
  //MB_DPRINTLN("MouseMove NEXT ignore hittest=%d", mIgnoreHittest);

  [[self nextResponder] mouseMoved:theEvent];
}

/////

- (void)mouseDown:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(0, ev);
  }

  // MB_DPRINT("MouseDown called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super mouseDown:theEvent];
}

- (void)mouseUp:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(2, ev);
  }

  // MB_DPRINT("MouseUp called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super mouseUp:theEvent];
}

- (void)mouseDragged:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(1, ev);
  }

  // MB_DPRINT("MouseDragged called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super mouseDragged:theEvent];
}

/////

- (void)rightMouseDown:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(0, ev);
  }

  MB_DPRINT("rightMouseDown called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super rightMouseDown:theEvent];
}

- (void)rightMouseUp:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(2, ev);
  }

  MB_DPRINT("rightMouseUp called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super rightMouseUp:theEvent];
}

- (void)rightMouseDragged:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(1, ev);
  }

  //MB_DPRINT("rightMouseDragged called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super rightMouseDragged:theEvent];
}

/////

- (void)otherMouseDown:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(0, ev);
  }

  MB_DPRINT("otherMouseDown called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super otherMouseDown:theEvent];
}

- (void)otherMouseUp:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(2, ev);
  }

  MB_DPRINT("otherMouseUp called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super otherMouseUp:theEvent];
}

- (void)otherMouseDragged:(NSEvent *)theEvent
{
  if (mOwner) {
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];
    mOwner->dispatchMouseEvent(1, ev);
  }

  //MB_DPRINT("otherMouseDragged called %f, %f!!\n", [NSEvent mouseLocation].x, [NSEvent mouseLocation].y);
  [super otherMouseDragged:theEvent];
}

/////

- (void)scrollWheel:(NSEvent *)theEvent
{
  const float scale = 50.0f;

  float delX = [theEvent deltaX];
  float delY = [theEvent deltaY];
  float delZ = [theEvent deltaZ];

  MB_DPRINTLN("scrollWheel x=%f, y=%f, z=%f", delX, delY, delZ);

  if (qlib::isNear(delX, 0.0f) &&
      qlib::isNear(delY, 0.0f)) {
    return;
  }

  if (mOwner) {
    if (mOwner->useMultiTouchPad()) {
      mOwner->scrollGesture(delX, delY);
      return;
    }

    delX *= scale;
    delY *= scale;
    qsys::InDevEvent ev;
    [self setUpMouseEvent: theEvent pEvent: &ev];

    ev.setType(qsys::InDevEvent::INDEV_WHEEL);
    ev.setDeltaX((int) delY);

    mOwner->dispatchMouseEvent(3, ev);
  }
  
}

///////////////
// Multi-touch events

// Pinch gesture
- (void) magnifyWithEvent: (NSEvent *) anEvent
{
  float deltaZ = [anEvent deltaZ];
  if (mOwner) {
    mOwner->pinchGesture(deltaZ);
  }
  // MB_DPRINT("magnify %f\n", deltaZ);
}
// rotate gesture
- (void) rotateWithEvent: (NSEvent *) anEvent
{
  float rot = [anEvent rotation];
  if (mOwner) {
    mOwner->rotateGesture(rot);
  }
  // MB_DPRINT("rotate %f\n", rot);
}
// swipe gesture
- (void) swipeWithEvent: (NSEvent *) anEvent
{
  MB_DPRINT("swipe %f %f\n", [anEvent deltaX], [anEvent deltaY]);

  if (mOwner) {
    mOwner->swipeGesture([anEvent deltaX], [anEvent deltaY]);
  }
}



/////

- (BOOL) acceptsFirstResponder
{
  //MB_DPRINT("===NSOglMolView: acceptsFirstResponder called!!\n");
  return NO;
}

- (BOOL) becomeFirstResponder
{
  //MB_DPRINT("===NSOglMolView: becmoeFirstResponder called!!\n");
  return NO;
}

- (BOOL) resignFirstResponder
{
  //MB_DPRINT("===NSOglMolView: resignFirstResponder called!!\n");
  return [super resignFirstResponder];
}

///////////////////////////////////////////////////////////////////////////

- (void) setUpMouseEvent: (NSEvent *)theEvent pEvent: (void *)pEvent
{
  NSPoint winLoc = [theEvent locationInWindow];
  NSPoint location = [self convertPoint:winLoc fromView:nil];
  NSUInteger mod = [theEvent modifierFlags];
  NSEventType type = [theEvent type];

  qsys::InDevEvent &ev = *(qsys::InDevEvent *)pEvent;

  // MB_DPRINTLN("(%d,%d)",drt.left + m_nViewX, drt.top + m_nViewY);
  //MB_DPRINTLN("modifier=%X", mod);

  location.y = [self frame].size.height - location.y;

  // ev.setSource(this);
  ev.setX((int) location.x );
  ev.setY((int) location.y );

  NSWindow *ns_win = [self window];
  NSScreen *ns_scr = [ns_win screen];

  NSPoint rootloc = [ns_win convertBaseToScreen: winLoc];
  rootloc.y = [ns_scr frame].size.height - rootloc.y;
  // MB_DPRINT("rootloc: %f, %f\n", rootloc.x, rootloc.y);
  ev.setRootX((int) rootloc.x);
  ev.setRootY((int) rootloc.y);

  int modif = 0;

  if (mod&NSShiftKeyMask)
    modif |= qsys::InDevEvent::INDEV_SHIFT;
  if (!mEmulateRBtn && (mod&NSControlKeyMask) )
    modif |= qsys::InDevEvent::INDEV_CTRL;
  if (mod&NSAlternateKeyMask)
    modif |= qsys::InDevEvent::INDEV_ALT;

  if (type==NSLeftMouseDown||
      type==NSLeftMouseUp||
      type==NSLeftMouseDragged) {

    if (mEmulateRBtn && (mod&NSControlKeyMask) ) {
      // Emulate Mouse RButton event by Ctrl button
      modif |= qsys::InDevEvent::INDEV_RBTN;
    }
    else {
      modif |= qsys::InDevEvent::INDEV_LBTN;
    }
  }
  else if (type==NSRightMouseDown||
	   type==NSRightMouseUp||
	   type==NSRightMouseDragged)
    modif |= qsys::InDevEvent::INDEV_RBTN;
  else if (type==NSOtherMouseDown||
	   type==NSOtherMouseUp||
	   type==NSOtherMouseDragged)
    modif |= qsys::InDevEvent::INDEV_MBTN;

  ev.setModifier(modif);

  return;
}

- (BOOL) getUseRbtnEmul
{
  return mEmulateRBtn;
}

- (void) setUseRbtnEmul: (BOOL) aFlag
{
  mEmulateRBtn = aFlag;
}

- (BOOL) isMSAAEnabled
{
  return mMSAAEnabled;
}

- (NSInteger) getMSAASamples
{
  return mMSAASamples;
}
@end
