// -*-Mode: C++;-*-
//
// Shared mock TimerImpl for the test_qsys binary
//

#ifndef QSYS_TEST_MOCK_TIMER_IMPL_HPP_INCLUDED
#define QSYS_TEST_MOCK_TIMER_IMPL_HPP_INCLUDED

#include <qlib/EventManager.hpp>

namespace qsystest {

/// TimerImpl whose clock the test controls. Anything reading
/// EventManager::getCurrentTime() (AnimMgr::start(), View animations, ...)
/// sees exactly what the test sets in m_now.
class MockTimerImpl : public qlib::TimerImpl
{
public:
    qlib::time_value m_now = 0;

    qlib::time_value getCurrentTime() override { return m_now; }
    void start(qlib::time_value /*period*/) override {}
    void stop() override {}
};

/// EventManager holds one TimerImpl for the whole process and asserts on a
/// second initTimer(), so every test TU in this binary shares this instance.
/// Tests must set m_now explicitly: another TU may have left the clock
/// advanced.
inline MockTimerImpl *getSharedMockTimer()
{
    static MockTimerImpl *s_pTimer = nullptr;
    if (s_pTimer == nullptr) {
        s_pTimer = MB_NEW MockTimerImpl();
        qlib::EventManager::getInstance()->initTimer(s_pTimer);
    }
    return s_pTimer;
}

}  // namespace qsystest

#endif
