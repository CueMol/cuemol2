
#include <common.h>

#include "EcTimerImpl.hpp"

namespace node_jsbr {

// static
void EcTimerImpl::timerCallback(uv_timer_t* handle)
{
    qlib::EventManager* pEM = qlib::EventManager::getInstance();
    pEM->performIdleTasks();
    MB_DPRINTLN("EcTimerImpl::timerCallback() called");
}

EcTimerImpl::EcTimerImpl()
{
    uv_timer_init(uv_default_loop(), &m_timer);
    m_timer.data = this;
}

EcTimerImpl::~EcTimerImpl()
{
    stop();
    uv_close(reinterpret_cast<uv_handle_t*>(&m_timer), nullptr);
}

void EcTimerImpl::start(qlib::time_value nperiod)
{
    if (m_running) stop();
    // nperiod is in milliseconds; uv_timer_start also uses milliseconds
    uv_timer_start(&m_timer, timerCallback, nperiod, nperiod);
    m_running = true;
}

void EcTimerImpl::stop()
{
    if (!m_running) return;
    uv_timer_stop(&m_timer);
    m_running = false;
}

}  // namespace node_jsbr
