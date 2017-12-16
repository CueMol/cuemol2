// -*-Mode: C++;-*-
//
//  Abstract computing context interface
//

#ifndef GFX_COMPUTE_CONTEXT_HPP_
#define GFX_COMPUTE_CONTEXT_HPP_

#include "gfx.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/LQuat.hpp>

namespace gfx {

  class GFX_API ComputeContext : public qlib::LObject
  {
  };
  
}

#endif

