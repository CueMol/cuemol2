//
// View implementation using iOS API
//

#ifndef IOS_QMVIEW_IMPL_HPP__
#define IOS_QMVIEW_IMPL_HPP__

#include <qlib/LString.hpp>
#include <qlib/EventManager.hpp>

#ifdef USE_GLES2
#include <sysdep/GLES2View.hpp>
#define IOS_VIEW_SUPER sysdep::GLES2View
#else
#include <sysdep/GLES1View.hpp>
#define IOS_VIEW_SUPER sysdep::GLES1View
#endif

@class EAGLView;

using qlib::LString;

class IosQmView : public IOS_VIEW_SUPER
{
private:
  typedef IOS_VIEW_SUPER super_t;

  EAGLView *m_pEAGLView;

public:
  IosQmView();
  virtual ~IosQmView();

  virtual void drawScene();

  void setup(EAGLView *pView);
};

#endif

