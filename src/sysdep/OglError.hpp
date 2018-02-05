//
//
//

#ifndef SYSDEP_OGL_ERROR_INCLUDED
#define SYSDEP_OGL_ERROR_INCLUDED

#ifdef MB_DEBUG
#  ifdef USE_GLES2
// check error - GLES2 version
#    define CHK_GLERROR(MSG)\
{ \
  GLenum errc; \
  errc = glGetError(); \
  if (errc!=GL_NO_ERROR) \
    MB_DPRINTLN("%s GLError (%d)", MSG, errc); \
}
#  else
// check error - GLU version
#    define CHK_GLERROR(MSG)\
{ \
  GLenum errc; \
  errc = glGetError(); \
  if (errc!=GL_NO_ERROR) \
    MB_DPRINTLN("%s GLError(%d): %s", MSG, errc, gluErrorString(errc)); \
}
#  endif // ifdef USE_GLES2
#else
// #  define CHK_GLERROR(MSG) glGetError()
#  define CHK_GLERROR(MSG)
#endif

#define CLR_GLERROR() glGetError()

#endif

