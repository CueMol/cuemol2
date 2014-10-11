//
// Timer implementation using Win32 API
//

#include <common.h>

#include <windows.h>

#include "sysdep.hpp"
#include "WinTimerImpl.hpp"

#include <qsys/SceneManager.hpp>

using namespace sysdep;

WinTimerImpl::WinTimerImpl()
     : m_nTimerID(0)
{
  start(30);
}

WinTimerImpl::~WinTimerImpl()
{
  stop();
}

qlib::time_value WinTimerImpl::getCurrentTime()
{
  qlib::time_value tval;

  tval = (qlib::time_value) ::GetTickCount();

  return tval;
}

//////////

//static
void WinTimerImpl::timerCallbackFunc(HWND hWnd, UINT, UINT_PTR id, DWORD dwTime)
{
  qlib::EventManager *pEM = qlib::EventManager::getInstance();
  pEM->messageLoop();
  pEM->checkTimerQueue();

  qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
  pSM->checkAndUpdateScenes();
  return;
}


void WinTimerImpl::start(qlib::time_value after)
{
  UINT id = ::SetTimer(NULL, 0, (UINT)after, WinTimerImpl::timerCallbackFunc);
  m_nTimerID = id;
}

void WinTimerImpl::stop()
{
  ::KillTimer(NULL, m_nTimerID);
  m_nTimerID = 0;
}

