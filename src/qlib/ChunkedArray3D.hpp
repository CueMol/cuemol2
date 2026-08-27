// -*-Mode: C++;-*-
//
// ChunkedArray3D: 3D array stored as a list of section chunks
//
// The volume is split along the slowest (section) axis into chunks of a
// bounded byte size (8 MiB by default), one heap allocation each, instead
// of a single ncol*nrow*nsec block. Large density maps then never need a
// multi-gigabyte contiguous allocation, which PartitionAlloc (the Chromium
// allocator behind the Electron process) refuses above about 2 GiB, and
// the element indexing is 64-bit throughout. The element order inside a
// chunk is the same as Array3D (column fastest), so a slice or a row is a
// contiguous run and a single-chunk instance is byte-compatible with
// Array3D.
//

#ifndef QLIB_CHUNKED_ARRAY_3D_HPP
#define QLIB_CHUNKED_ARRAY_3D_HPP

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

  template <class T>
  class ChunkedArray3D
  {
  public:
    typedef T value_type;

    /// Default upper bound of one chunk in bytes
    static const size_t kDefaultChunkBytes = size_t(8) << 20;

    /// Chunk layout for a given size; computable without allocating (so
    /// the memory plan of a huge map can be checked up front).
    struct Layout {
      int ncol, nrow, nsec;
      /// sections per chunk (the last chunk may hold fewer)
      int secsPerChunk;
      int nchunk;
      /// elements per section
      size_t sliceSize;
      /// total elements
      size_t total;

      static Layout make(int ncol, int nrow, int nsec, size_t chunkBytes)
      {
        Layout l;
        l.ncol = std::max(ncol, 0);
        l.nrow = std::max(nrow, 0);
        l.nsec = std::max(nsec, 0);
        l.sliceSize = size_t(l.ncol) * size_t(l.nrow);
        l.total = l.sliceSize * size_t(l.nsec);
        const size_t sliceBytes = l.sliceSize * sizeof(T);
        size_t spc = 1;
        if (sliceBytes > 0 && chunkBytes > sliceBytes)
          spc = chunkBytes / sliceBytes;
        if (spc > size_t(1) << 30)
          spc = size_t(1) << 30;
        l.secsPerChunk = int(std::max<size_t>(spc, 1));
        // an empty volume (any zero extent) has no chunks at all
        l.nchunk = (l.total > 0) ? (l.nsec + l.secsPerChunk - 1) / l.secsPerChunk : 0;
        return l;
      }
    };

  private:
    Layout m_layout;
    std::vector<std::unique_ptr<T[]>> m_chunks;

    void allocate()
    {
      m_chunks.clear();
      m_chunks.reserve(m_layout.nchunk);
      for (int c = 0; c < m_layout.nchunk; ++c) {
        const size_t n = size_t(chunkSecs(c)) * m_layout.sliceSize;
        T *p = NULL;
        try {
          // plain new[] (no value-initialization): the caller fills the
          // array, and zeroing a multi-gigabyte map would be a wasted pass
          p = MB_NEW T[n];
        }
        catch (const std::bad_alloc &) {
          m_chunks.clear();
          m_layout = Layout::make(0, 0, 0, kDefaultChunkBytes);
          MB_THROW(OutOfMemoryException,
                   LString::format("ChunkedArray3D: cannot allocate chunk %d (%lld bytes)",
                                   c, (long long) (n * sizeof(T))));
        }
        m_chunks.push_back(std::unique_ptr<T[]>(p));
      }
    }

  public:
    ChunkedArray3D()
    {
      m_layout = Layout::make(0, 0, 0, kDefaultChunkBytes);
    }

    ChunkedArray3D(int ncol, int nrow, int nsec,
                   size_t chunkBytes = kDefaultChunkBytes)
    {
      m_layout = Layout::make(ncol, nrow, nsec, chunkBytes);
      allocate();
    }

    ChunkedArray3D(const ChunkedArray3D &arg)
    {
      m_layout = arg.m_layout;
      allocate();
      for (int c = 0; c < m_layout.nchunk; ++c) {
        const size_t n = size_t(chunkSecs(c)) * m_layout.sliceSize;
        std::copy(arg.m_chunks[c].get(), arg.m_chunks[c].get() + n,
                  m_chunks[c].get());
      }
    }

    ChunkedArray3D(ChunkedArray3D &&arg) noexcept
      : m_layout(arg.m_layout), m_chunks(std::move(arg.m_chunks))
    {
      arg.m_layout = Layout::make(0, 0, 0, kDefaultChunkBytes);
    }

    ChunkedArray3D &operator=(ChunkedArray3D arg) noexcept
    {
      swap(arg);
      return *this;
    }

    void swap(ChunkedArray3D &arg) noexcept
    {
      std::swap(m_layout, arg.m_layout);
      m_chunks.swap(arg.m_chunks);
    }

    /// Re-allocate for a new size (contents are not preserved)
    void resize(int ncol, int nrow, int nsec,
                size_t chunkBytes = kDefaultChunkBytes)
    {
      m_chunks.clear();
      m_layout = Layout::make(ncol, nrow, nsec, chunkBytes);
      allocate();
    }

    void clear()
    {
      m_chunks.clear();
      m_layout = Layout::make(0, 0, 0, kDefaultChunkBytes);
    }

    bool empty() const { return m_layout.total == 0; }

    const Layout &layout() const { return m_layout; }

    int cols() const { return m_layout.ncol; }
    int rows() const { return m_layout.nrow; }
    int secs() const { return m_layout.nsec; }
    int getColumns() const { return m_layout.ncol; }
    int getRows() const { return m_layout.nrow; }
    int getSections() const { return m_layout.nsec; }

    /// total number of elements (64-bit)
    size_t size() const { return m_layout.total; }

    /// elements per section
    size_t sliceSize() const { return m_layout.sliceSize; }

    int chunkCount() const { return m_layout.nchunk; }
    int secsPerChunk() const { return m_layout.secsPerChunk; }

    /// first section index of chunk c
    int chunkFirstSec(int c) const { return c * m_layout.secsPerChunk; }

    /// number of sections in chunk c
    int chunkSecs(int c) const
    {
      return std::min(m_layout.secsPerChunk,
                      m_layout.nsec - c * m_layout.secsPerChunk);
    }

    /// contiguous elements of chunk c (chunkSecs(c) * sliceSize())
    T *chunkData(int c)
    {
      MB_ASSERT(c >= 0 && c < m_layout.nchunk);
      return m_chunks[c].get();
    }
    const T *chunkData(int c) const
    {
      MB_ASSERT(c >= 0 && c < m_layout.nchunk);
      return m_chunks[c].get();
    }

    /// contiguous elements of section k (sliceSize() of them)
    T *slice(int k)
    {
      MB_ASSERT(k >= 0 && k < m_layout.nsec);
      const int c = k / m_layout.secsPerChunk;
      return m_chunks[c].get() +
             size_t(k - c * m_layout.secsPerChunk) * m_layout.sliceSize;
    }
    const T *slice(int k) const
    {
      MB_ASSERT(k >= 0 && k < m_layout.nsec);
      const int c = k / m_layout.secsPerChunk;
      return m_chunks[c].get() +
             size_t(k - c * m_layout.secsPerChunk) * m_layout.sliceSize;
    }

    /// contiguous elements of row j of section k (cols() of them)
    T *row(int j, int k)
    {
      MB_ASSERT(j >= 0 && j < m_layout.nrow);
      return slice(k) + size_t(j) * size_t(m_layout.ncol);
    }
    const T *row(int j, int k) const
    {
      MB_ASSERT(j >= 0 && j < m_layout.nrow);
      return slice(k) + size_t(j) * size_t(m_layout.ncol);
    }

    T &at(int i, int j, int k)
    {
      MB_ASSERT(i >= 0 && i < m_layout.ncol);
      return row(j, k)[i];
    }
    const T &at(int i, int j, int k) const
    {
      MB_ASSERT(i >= 0 && i < m_layout.ncol);
      return row(j, k)[i];
    }

    void fill(const T &v)
    {
      for (int c = 0; c < m_layout.nchunk; ++c) {
        const size_t n = size_t(chunkSecs(c)) * m_layout.sliceSize;
        std::fill(m_chunks[c].get(), m_chunks[c].get() + n, v);
      }
    }
  };

}

#endif
