// -*-Mode: C++;-*-
//
// View capability info
//

#ifndef QSYS_VIEW_CAP_HPP_INCLUDE_
#define QSYS_VIEW_CAP_HPP_INCLUDE_

#include "qsys.hpp"

namespace qsys {

  class QSYS_API ViewCap
  {
  public:
    ViewCap() {}
    virtual ~ViewCap() {}

    /// vertex buffer object
    virtual bool hasVBO() const { return false; }
    /// framebuffer object
    virtual bool hasFBO() const { return false; }

    /// vertex shader
    virtual bool hasVertShader() const { return false; }
    /// fragment shader
    virtual bool hasFragShader() const { return false; }
    /// geoetry shader
    virtual bool hasGeomShader() const { return false; }

  };
}

#endif

