#include <gtest/gtest.h>
#include <common.h>
#include "qsys/InDevEvent.hpp"
#include "qsys/MouseEventHandler.hpp"

using qsys::InDevEvent;
using qsys::MouseEventHandler;

namespace {

InDevEvent at(int x, int y)
{
    InDevEvent ev;
    ev.setX(x);
    ev.setY(y);
    return ev;
}

}  // namespace

// A drag that ends right after a run of moves must report a velocity
// (momentum scrolling). The move/release gap and the averaging window are
// milliseconds; the event clock is nanoseconds, so comparing them without
// conversion used to reject every drag.
TEST(MouseEventHandler, ReleaseAfterQuickDragHasVelocity)
{
    MouseEventHandler h;
    InDevEvent down = at(0, 0);
    h.buttonDown(down);

    for (int i = 1; i <= 8; ++i) {
        InDevEvent mv = at(i * 10, 0);
        h.move(mv);
    }
    EXPECT_EQ(h.getState(), MouseEventHandler::DRAG_DRAG);

    InDevEvent up = at(80, 0);
    h.buttonUp(up);
    EXPECT_GT(up.getVeloX(), 0.0);
    EXPECT_NEAR(up.getVeloY(), 0.0, 1e-9);
}

TEST(MouseEventHandler, ClickWithoutDragHasNoVelocity)
{
    MouseEventHandler h;
    InDevEvent down = at(5, 5);
    h.buttonDown(down);
    InDevEvent up = at(5, 5);
    h.buttonUp(up);
    EXPECT_NEAR(up.getVeloX(), 0.0, 1e-9);
    EXPECT_NEAR(up.getVeloY(), 0.0, 1e-9);
}
