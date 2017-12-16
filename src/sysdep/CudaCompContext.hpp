// -*-Mode: C++;-*-
//
//  CUDA computing context interface
//

#ifndef SYSDEP_CUDA_COMPUTE_CONTEXT_HPP_
#define SYSDEP_CUDA_COMPUTE_CONTEXT_HPP_

#include "sysdep.hpp"

#include <qlib/LExceptions.hpp>
#include <gfx/ComputeContext.hpp>

#include <cuda.h>
#include <cudaGL.h>

namespace gfx {

  class SYSDEP_API CudaCompArray : public gfx::ComputeArray
  {
  private:
    CUdeviceptr m_devptr;
    int m_nSize;

  public:

    CudaCompArray() : m_devptr(0), m_nSize(0)
    {
    }

    virtual ~CudaCompArray()
    {
      cleanup();
    }

    virtual void alloc(int nsz)
    {
      CUresult error;
      error = cuMemAlloc(&m_devptr, nsz);
      if (error != CUDA_SUCCESS) {
        MB_THROW(qlib::RuntimeException, "cuMemAlloc failed");
        return;
      }
      m_nSize = nsz;
    }
    
    virtual void cleanup()
    {
      CUresult error;
      if (m_devptr)
        error = cuMemFree(m_devptr);
      m_devptr = 0;
    }

    virtual void copyFrom(const void *pmem, int nsz)
    {
      CUresult error;
      error = cuMemcpyHtoD(m_devptr, pmem, nsz);
      if (error != CUDA_SUCCESS) {
        MB_THROW(qlib::RuntimeException, "cuMemcpyHtoD failed");
        return;
      }
    }

    virtual void copyTo(void *pmem, int nsz)
    {
      CUresult error;
      error = cuMemcpyDtoH(pmem, m_devptr, nsz);
      if (error != CUDA_SUCCESS) {
        MB_THROW(qlib::RuntimeException, "cuMemcpyDtoH failed");
        return;
      }
    }
  };

  class SYSDEP_API CudaCompContext : public gfx::ComputeContext
  {
  private:
    CUcontext m_cuContext;

  public:

    CudaCompContext() : m_cuContext(0)
    {
    }

    virtual ~CudaCompContext()
    {
      cleanup();
    }

    virtual void init()
    {
      cuInit(0);

      // check CUDA availability
      int deviceCount = 0;
      CUresult error;
      error = cuDeviceGetCount(&deviceCount);
      if (error != CUDA_SUCCESS) {
        MB_THROW(qlib::RuntimeException, "cuDeviceGetCount failed");
        return;
      }
      if (deviceCount == 0) {
        MB_THROW(qlib::RuntimeException, "cudaDeviceInit error: no devices supporting CUDA");
        return;
      }

      // find current OpenGL context compatible device
      unsigned int gldevCount = 0;
      CUdevice cuDevice = 0;
      error = cuGLGetDevices(&gldevCount, &cuDevice, 1, CU_GL_DEVICE_LIST_ALL);
      if (error != CUDA_SUCCESS) {
        MB_THROW(qlib::RuntimeException, "cudaDeviceInit error: no devices supporting CUDA");
        return;
      }
      
      // int dev = 0;
      // cuDeviceGet(&cuDevice, dev);

      char name[256];
      cuDeviceGetName(name, sizeof(name), cuDevice);
      LOG_DPRINTLN("Cuda> initialized for CUDA Device %d: %s", int(cuDevice), name);

      // Create context
      error = cuCtxCreate(&m_cuContext, 0, cuDevice);
      if (error != CUDA_SUCCESS){
        MB_THROW(qlib::RuntimeException, "cuCtxCreate failed");
        return;
      }

    }

    void cleanup()
    {
      CUresult error;
      if (m_cuContext)
        error = cuCtxDestroy(m_cuContext);
      m_cuContext = 0;
    }

    virtual ComputeArray *createArray()
    {
      return MB_NEW CudaCompArray();
    }

  };
  
}

#endif


