#pragma once

#include <qlib/EventManager.hpp>

namespace node_jsbr {

class ElecTimerImpl : public qlib::TimerImpl
{
private:
public:
    ElecTimerImpl() = default;
    virtual ~ElecTimerImpl() = default;

    virtual void start(qlib::time_value nperiod) {}

    virtual void stop() {}
};

}  // namespace node_jsbr
