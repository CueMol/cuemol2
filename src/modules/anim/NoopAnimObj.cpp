// -*-Mode: C++;-*-
//
// Do nothing dummy animobj
//

#include <common.h>

#include "NoopAnimObj.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/Camera.hpp>

using namespace anim;

NoopAnimObj::NoopAnimObj()
     : super_t()
{
}

NoopAnimObj::NoopAnimObj(const NoopAnimObj &arg)
     : super_t(arg)
{
}

NoopAnimObj::~NoopAnimObj()
{
}

