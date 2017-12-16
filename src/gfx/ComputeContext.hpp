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
#include <qlib/Array.hpp>

namespace gfx {

  class GFX_API ComputeArray : public qlib::LObject
  {
  public:
    virtual ~ComputeArray()
    {
    }

    virtual void alloc(int nsz)
    {
    }

    virtual void cleanup()
    {
    }

    virtual void copyFrom(const void *pmem, int nsz)
    {
    }
    
    virtual void copyTo(void *pmem, int nsz)
    {
    }

    //////////

    template <class _Type>
    void initWith(const qlib::Array<_Type> &ary)
    {
      const int nsz = ary.size() * sizeof(_Type);
      alloc(nsz);
      copyFrom(ary.data(), nsz);
    }

    template <class _Type>
    void copyFrom(const qlib::Array<_Type> &ary)
    {
      const int nsz = ary.size() * sizeof(_Type);
      copyFrom(ary.data(), nsz);
    }
    
    template <class _Type>
    void copyTo(void *pmem, int nsz)
    {
      const int nsz = ary.size() * sizeof(_Type);
      copyTo(ary.data(), nsz);
    }

  };

  class GFX_API ComputeContext : public qlib::LObject
  {
  public:
    virtual ~ComputeContext()
    {
    }

    virtual void init()
    {
    }

    virtual ComputeArray *createArray()
    {
      return NULL;
    }
  };
  
}

#endif

