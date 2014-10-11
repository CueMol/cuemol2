// -*-Mode: C++;-*-
//
//  Generic Hittest class
//
//  $Id: Hittest.hpp,v 1.3 2011/01/09 15:12:22 rishitani Exp $

#ifndef GFX_HIT_TEST_HPP_
#define GFX_HIT_TEST_HPP_

#include "gfx.hpp"

namespace gfx {

  ///
  ///  Raw hittest data class.
  ///  Interpretation of the raw hittest data 
  ///  depends on the renderer class, by which hittest was performed.
  ///  Implementation of RawHitData depends on the underlying Gfx implementation.
  ///
  class GFX_API RawHitData {
  public:
    virtual ~RawHitData() {}

    virtual int getDataSize(qlib::uid_t rend_id) const =0;
    virtual int getDataAt(qlib::uid_t rend_id, int ii, int subii) const =0;
  };


} // namespace gfx

#endif
