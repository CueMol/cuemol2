// -*-Mode: C++;-*-
//
//  CUDA test
//

#define THR_PER_BLK 1024

__global__ void test_kernel(unsigned char *input, unsigned char *output, int len)
{
  int i = blockDim.x * blockIdx.x + threadIdx.x;
  if (i < len)
    output[len-i] = input[i];
}


void launchTestKernel(unsigned char *input, unsigned char *output, int nlen)
{

  int ngrd;
  if (nlen%THR_PER_BLK==0)
    ngrd = nlen/THR_PER_BLK;
  else
    ngrd = nlen/THR_PER_BLK + 1;

  // execute the kernel
  dim3 block(THR_PER_BLK, 1, 1);
  dim3 grid(ngrd, 1, 1);
  test_kernel<<<grid, block>>>(input, output, nlen);
}

/*
#include <common.h>
#include <sysdep/CudartCompContext.hpp>

void launchTestKernel(const gfx::ComputeArray *pCA_in, gfx::ComputeArray *pCA_out)
{
  const sysdep::CudartCompArray *pcin = static_cast<const sysdep::CudartCompArray *>(pCA_in);
  float *input = (float *) pcin->getHandle();
  
  sysdep::CudartCompArray *pcout = static_cast<sysdep::CudartCompArray *>(pCA_out);
  float *output = (float *) pcout->getHandle();
  
  int nlen = pCA_in->getElemCount();

  int ngrd;
  if (nlen%THR_PER_BLK==0)
    ngrd = nlen/THR_PER_BLK;
  else
    ngrd = nlen/THR_PER_BLK + 1;

  // execute the kernel
  dim3 block(THR_PER_BLK, 1, 1);
  dim3 grid(ngrd, 1, 1);
  test_kernel<<<grid, block>>>(input, output, nlen);
}
*/


