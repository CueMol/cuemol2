// -*-Mode: C++;-*-
//
//  Thread object
//

#pragma once

#include "qlib.hpp"

namespace qlib {

class LTThreadImpl;

class QLIB_API LThread
{
private:
    LTThreadImpl *m_pimp;

    //////////

public:
    LThread();

    virtual ~LThread();

    //////////

    virtual void run() = 0;

    void kick();
    void waitTermination();
    bool waitTermination(int nsec);
    bool isRunning() const;
};

}  // namespace qlib
