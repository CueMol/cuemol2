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
        /*if (errc != GL_NO_ERROR)*/ MB_DPRINTLN("%s GLError (%X)", MSG, errc); \
    }
#define CLR_GLERROR() glGetError()
#else
#define CHK_GLERROR(MSG) void(0)
#define CLR_GLERROR() void(0)
#endif
