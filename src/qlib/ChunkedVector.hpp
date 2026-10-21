// -*-Mode: C++;-*-
//
// ChunkedVector: append-only 1D array stored as a list of fixed-size blocks
//
// std::vector doubles its capacity when it grows, so an array of 1.1 GB
// asks for one 2.2 GB block (and copies the old one into it). PartitionAlloc
// (the Chromium allocator behind the Electron process) refuses a single
// allocation above about 2 GiB and stops the process, although the data
// itself would fit. This array grows by adding a block of 2^kShift elements
// (about 8 MiB by default) instead: no allocation is ever larger than one
// block and the elements already stored are never copied. The elements of
// a block are contiguous (forEachSpan()), the array as a whole is not.
// See also ChunkedArray3D, the same idea for 3D maps.
//

#ifndef QLIB_CHUNKED_VECTOR_HPP
#define QLIB_CHUNKED_VECTOR_HPP

#include <algorithm>
#include <cstddef>
#include <memory>
#include <new>
#include <vector>

#include "LDebugAssert.hpp"
#include "LDebugNew.hpp"
#include "LExceptions.hpp"
#include "LString.hpp"

namespace qlib {

  namespace detail {
    /// log2 of the largest power-of-two element count whose block fits in
    /// nBytes (at least one element)
    constexpr int chunkedVectorShift(size_t elemBytes, size_t nBytes)
    {
      int shift = 0;
      while ((elemBytes << (shift + 1)) <= nBytes)
        ++shift;
      return shift;
    }
  }

  template <class T,
            int kShift = detail::chunkedVectorShift(sizeof(T), size_t(8) << 20)>
  class ChunkedVector
  {
  public:
    typedef T value_type;

    /// Elements per block
    static constexpr size_t kBlockSize = size_t(1) << kShift;

  private:
    static constexpr size_t kMask = kBlockSize - 1;

    std::vector<std::unique_ptr<T[]>> m_blocks;
    size_t m_size = 0;

    void addBlock()
    {
      T *p = NULL;
      try {
        p = MB_NEW T[kBlockSize];
      }
      catch (const std::bad_alloc &) {
        MB_THROW(OutOfMemoryException,
                 LString::format("ChunkedVector: cannot allocate block %d (%lld bytes)",
                                 int(m_blocks.size()),
                                 (long long) (kBlockSize * sizeof(T))));
      }
      m_blocks.push_back(std::unique_ptr<T[]>(p));
    }

  public:
    void push_back(const T &v)
    {
      if ((m_size >> kShift) == m_blocks.size()) addBlock();
      m_blocks[m_size >> kShift][m_size & kMask] = v;
      ++m_size;
    }

    T &operator[](size_t i)
    {
      MB_ASSERT(i < m_size);
      return m_blocks[i >> kShift][i & kMask];
    }
    const T &operator[](size_t i) const
    {
      MB_ASSERT(i < m_size);
      return m_blocks[i >> kShift][i & kMask];
    }

    size_t size() const { return m_size; }
    bool empty() const { return m_size == 0; }

    /// Remove every element and free the blocks
    void clear()
    {
      std::vector<std::unique_ptr<T[]>>().swap(m_blocks);
      m_size = 0;
    }

    /// Call f(const T *p, size_t n) for each block in order, with its first
    /// element and number of elements in use
    template <class F>
    void forEachSpan(F f) const
    {
      for (size_t b = 0; b < m_blocks.size(); ++b) {
        const size_t first = b << kShift;
        if (first >= m_size) break;
        f(static_cast<const T *>(m_blocks[b].get()),
          std::min(kBlockSize, m_size - first));
      }
    }
  };

}

#endif
