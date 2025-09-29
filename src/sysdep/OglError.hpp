//
//
//

#pragma once

#ifdef MB_DEBUG
// check error
#define CHK_GLERROR(MSG)                                                        \
    {                                                                           \
        GLenum errc;                                                            \
        errc = glGetError();                                                    \
        /*if (errc != GL_NO_ERROR)*/ MB_DPRINTLN("%s GLError (%d)", MSG, errc); \
    }
#else
#define CHK_GLERROR(MSG) glGetError()
#endif

#define CLR_GLERROR() glGetError()
