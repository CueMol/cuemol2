// -*-Mode: C++;-*-
//
// Automatic JS_Begin/EndRequest caller
//

#ifndef JSBR_AUTOJSREQUEST_HPP_INCLUDED__
#define JSBR_AUTOJSREQUEST_HPP_INCLUDED__

namespace jsbr {

class AutoJSRequest
{
private:
    JSContext* mCX;
public:
  AutoJSRequest(JSContext *cx)
       : mCX(cx) {BeginRequest();}
  ~AutoJSRequest() {EndRequest();}

  void EndRequest() {
#if defined(JS_EndRequest)
    if(mCX) {
      JS_EndRequest(mCX);
      mCX = NULL;
    }
#endif
  }

private:
  void BeginRequest() {
#if defined(JS_BeginRequest)
    if(JS_GetContextThread(mCX))
      JS_BeginRequest(mCX);
    else
      mCX = NULL;
#endif
  }
};

}

#endif

