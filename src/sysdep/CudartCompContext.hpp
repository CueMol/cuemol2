// -*-Mode: C++;-*-
//
//  CUDA computing context interface
//

#ifndef SYSDEP_CUDA_COMPUTE_CONTEXT_HPP_
#define SYSDEP_CUDA_COMPUTE_CONTEXT_HPP_

#include "sysdep.hpp"

#include <qlib/LExceptions.hpp>
#include <gfx/ComputeContext.hpp>

#if HAVE_GLEW
#  include <GL/glew.h>
#endif

#include <cuda_runtime.h>
#include <cuda_gl_interop.h>

#include "CudartErr.hpp"

namespace sysdep {

  template< typename T >
  void chkErrImpl(T result, char const *const func, const char *const file, int const line)
  {
    if (result) {
      LString msg = LString::format("CUDA error at %s:%d code=%d(%s) \"%s\"",
                                    file, line, static_cast<unsigned int>(result), _cudartGetErrorEnum(result), func);
      //DEVICE_RESET
      // Make sure we call CUDA Device Reset before exiting
      MB_THROW(qlib::RuntimeException, msg);
    }
  }

// This will output the proper CUDA error strings in the event that a CUDA host call returns an error
#define chkCudaErr(val)           sysdep::chkErrImpl( (val), #val, __FILE__, __LINE__ )

  class SYSDEP_API CudartCompArray : public gfx::ComputeArray
  {
  private:
    void *m_devptr;

    typedef gfx::ComputeArray super_t;

  public:

    CudartCompArray() : m_devptr(0), super_t()
    {
    }

    virtual ~CudartCompArray()
    {
      cleanup();
    }

    virtual void alloc(int nsz1, int nsz2)
    {
      chkCudaErr( cudaMalloc(&m_devptr, nsz1*nsz2) );
      //m_nSize = nsz;
    }
    
    virtual void cleanup()
    {
      if (m_devptr)
        chkCudaErr( cudaFree(m_devptr) );
      m_devptr = 0;
    }

    virtual void copyFrom(const void *pmem, int nsz1, int nsz2)
    {
      chkCudaErr( cudaMemcpy(m_devptr, pmem, nsz1*nsz2, cudaMemcpyHostToDevice) );
    }

    virtual void copyTo(void *pmem, int nsz1, int nsz2)
    {
      chkCudaErr( cudaMemcpy(pmem, m_devptr, nsz1*nsz2, cudaMemcpyDeviceToHost) );
    }

    void *getHandle() const { return m_devptr; }

  };

  class SYSDEP_API CudartCompContext : public gfx::ComputeContext
  {
  private:
//    CUcontext m_cuContext;

  public:

    CudartCompContext()
    {
    }

    virtual ~CudartCompContext()
    {
      cleanup();
    }

    virtual void init()
    {
      // cuInit(0);

      // check CUDA availability
      int deviceCount = 0;
      chkCudaErr( cudaGetDeviceCount(&deviceCount) );

      if (deviceCount == 0) {
        MB_THROW(qlib::RuntimeException, "No devices supporting CUDA found");
        return;
      }

      // find current OpenGL context compatible device
      unsigned int gldevCount = 0;
      int devid = 0;
      chkCudaErr( cudaGLGetDevices(&gldevCount, &devid, 1, cudaGLDeviceListAll) );
      if (gldevCount == 0) {
        MB_THROW(qlib::RuntimeException, "No devices supporting CUDA GL interop found");
        return;
      }
      
      cudaDeviceProp deviceProp;
      chkCudaErr( cudaGetDeviceProperties(&deviceProp, devid) );
      LOG_DPRINTLN("Cuda> initialized for CUDA Device %d: %s", devid, deviceProp.name);

      //chkCudaErr( cudaGLSetGLDevice(devid) );
      chkCudaErr( cudaSetDevice(devid) );

    }

    void cleanup()
    {
    }

    virtual gfx::ComputeArray *createArray()
    {
      return MB_NEW CudartCompArray();
      //return NULL;
    }

  };
  
}

#endif


