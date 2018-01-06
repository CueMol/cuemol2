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
  private:
    int m_nElemCount;
    int m_nElemSize;

  public:
    ComputeArray() : m_nElemCount(0), m_nElemSize(0)
    {
    }

    virtual ~ComputeArray()
    {
    }

    virtual void alloc(int nsz1, int nsz2)
    {
    }

    virtual void cleanup()
    {
    }

    virtual void copyFrom(const void *pmem, int nsz1, int nsz2)
    {
    }
    
    virtual void copyTo(void *pmem, int nsz1, int nsz2)
    {
    }

    //////////


    int getElemCount() const { return m_nElemCount; }
    int getElemSize() const { return m_nElemSize; }

    template <class _Type>
    void initWith(const qlib::Array<_Type> &ary)
    {
      m_nElemCount = ary.size();
      m_nElemSize = sizeof(_Type);
      alloc(m_nElemCount, m_nElemSize);
      copyFrom(ary.data(), m_nElemCount, m_nElemSize);
    }

    template <class _Type>
    void copyFrom(const qlib::Array<_Type> &ary)
    {
      copyFrom(ary.data(), ary.size(), sizeof(_Type));
    }
    
    template <class _Type>
    void copyTo(qlib::Array<_Type> &ary)
    {
      copyTo(ary.data(), ary.size(), sizeof(_Type));
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

