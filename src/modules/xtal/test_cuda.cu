// -*-Mode: C++;-*-
//
//  CUDA test
//

#define THR_PER_BLK 1024

__global__ void test_kernel(float *input, float *output, int len)
{
  int i = blockDim.x * blockIdx.x + threadIdx.x;
  if (i < len)
    output[i] = input[i];
}


void launchTestKernel(float *input, float *output, int nlen)
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


