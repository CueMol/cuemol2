#pragma once

#include <uv.h>
#include <qlib/EventManager.hpp>

namespace node_jsbr {

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
