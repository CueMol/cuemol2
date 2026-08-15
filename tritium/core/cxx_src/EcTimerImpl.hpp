#pragma once

#include <uv.h>
#include <qlib/EventManager.hpp>

namespace node_jsbr {

/// libuv-backed TimerImpl for the Electron/node host.
///
/// The uv timer is currently never started: EventManager::initTimer() does not
/// drive start(), and the addon is initialized inside the Web Worker where the
/// libuv default loop is not pumped. The worker render loop calls the
/// performIdleTasks() N-API export once per frame instead (see
/// react-gui/src/renderer/worker/server/gfx/ViewLoopController.ts). start() /
/// stop() are kept for a future main-thread-driven host.
class EcTimerImpl : public qlib::TimerImpl
{
private:
    uv_timer_t m_timer;
    bool m_running = false;

    static void timerCallback(uv_timer_t* handle);

public:
    EcTimerImpl();
    virtual ~EcTimerImpl();

    virtual void start(qlib::time_value nperiod) override;
    virtual void stop() override;
};

}  // namespace node_jsbr
