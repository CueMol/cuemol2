// -*-Mode: C++;-*-
//
// Array.hpp
//   Linear array class: Array
//

#ifndef QLIB_ARRAY_1D_HPP_INCLUDED
#define QLIB_ARRAY_1D_HPP_INCLUDED

#include "LDebugAssert.hpp"
#include "LDebugNew.hpp"
#include "Vector3I.hpp"

#include <complex>

namespace qlib {

  template <class _Type>
  class Array
  {
  private:
    /// data
    _Type *m_array;

    /// number of elements
    int m_nSize;
    
    /// This object own the m_array or not (usually true)
    bool m_bOwn;

  public:
    typedef _Type value_type;

    ///
    /// Make empty array (we must allocate memory by resize() later.)
    ///
    Array() : m_array(NULL), m_nSize(0), m_bOwn(false)
    {
    }
    
    ///
    ///  Make array with size sz
    ///
    explicit Array(int sz)
      : m_nSize(sz), m_bOwn(true)
    {
      m_array = MB_NEW _Type[sz];
    }

    ///
    ///  Make array with size sz and initialize all elements by ini
    ///
    explicit Array(const _Type &ini, int sz)
      : m_nSize(sz), m_bOwn(true)
    {
      m_array = MB_NEW _Type[sz];
      for (int i=0; i<sz; i++)
        m_array[i] = ini;
    }

    ///
    ///  Make array from existing C array
    ///
    explicit Array(int sz, const _Type *p)
      : m_nSize(sz), m_bOwn(true)
    {
      m_array = MB_NEW _Type[sz];
      for (int i=0; i<sz; i++)
        m_array[i] = p[i];
    }
    
    ///
    /// Copy constructor
    ///
    Array(const Array<_Type> &arg)
      : m_nSize(arg.m_nSize), m_bOwn(true)
    {
      m_array = MB_NEW _Type[arg.m_nSize];
      for(int i=0; i<arg.m_nSize; i++)
        m_array[i] = arg.m_array[i];
    }
    
    ~Array()
    {
      clear();
    }

    /////////////////////////////////////////////////////
    // member methods

    inline int size() const { return m_nSize; }
    inline int getSize() const { return size(); }

    void clear() {
      if (m_array!=NULL && m_bOwn)
	delete [] m_array;
      m_array = NULL;
      m_nSize = 0;
      m_bOwn = false;
    }

    /// Yield the ownership of m_array
    void yield() {
      m_array = NULL;
      m_nSize = 0;
      m_bOwn = false;
    }

    /// Allocate new memory (clear old m_array if nescessary)
    void resize(int newsz) {
      clear();

      if (newsz>0) {
        m_array = MB_NEW _Type[newsz];
	m_bOwn = true;
        m_nSize = newsz;
      }
    }

    /// Setup reference (un-owned) array
    void refer(int sz, _Type *p) {
      clear();
      if (sz>0) {
	m_array = p;
	m_bOwn = false;
	m_nSize = sz;
      }
    }

    inline bool isOwn() const { return m_bOwn; }

    /// alias for resize
    inline void allocate(int newsz) { resize(newsz); }

    /// alias for clear
    inline void destroy() { clear(); }

    const _Type &at(int i) const {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nSize);
      return m_array[i];
    }

    _Type &at(int i) {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nSize);
      return m_array[i];
    }

    const _Type *data() const {
      return m_array;
    }

    _Type *data() {
      return m_array;
    }

    /////////////////////////////////////////////////////
    // member operators

    operator const _Type *() const {
      return data();
    }

    const Array<_Type> &operator =(const Array<_Type> &arg)
    {
      if(&arg!=this){
        clear();
        m_array = MB_NEW _Type[arg.getSize()];
        m_bOwn = true;
        m_nSize = arg.m_nSize;
        for(int i=0; i<arg.getSize(); i++)
          m_array[i] = arg[i];
      }
      return *this;
    }

    const Array<_Type> &operator =(const _Type &arg)
    {
      for(int i=0; i<getSize(); i++)
	m_array[i] = arg;
      return *this;
    }

    const _Type &operator [](int i) const {
      return at(i);
    }

    _Type &operator [](int i) {
      return at(i);
    }
  };

  //////////////////////////////

  template <class _Type>
  class Array3D : public Array<_Type>
  {
  public:
    /// Superclass type
    typedef Array<_Type> super_t;

  public:
    
    /// Default ctor / Make empty array (we must allocate memory by resize() later.)
    Array3D() : super_t(), m_nRank(3)
    {
    }

    Array3D(int ncol, int nrow, int nsect)
         : super_t(ncol*nrow*nsect), m_nRank(3), m_dim(ncol,nrow,nsect)
    {
    }

    Array3D(int ncol, int nrow, int nsect, const _Type *p)
         : super_t(ncol*nrow*nsect, p), m_nRank(3), m_dim(ncol,nrow,nsect)
    {
    }

    /// Copy ctor
    Array3D(const Array3D<_Type> &arg)
         : super_t(arg), m_nRank(arg.m_nRank), m_dim(arg.m_dim)
    {
    }

    ~Array3D() {
    }

  private:
    /// Rank (max: 3)
    int m_nRank;

  public:
    int getRank() const { return m_nRank; }

    void setRank(int n) {
      if (n<1||n>3) {
        LString msg = LString::format("Array3D.setRank: invalid rank %d", n);
        MB_THROW(IllegalArgumentException, msg);
        return;
      }
      m_nRank = n;
    }

  private:
    /// Dimension of this array (nx, ny, nz)
	  Vector3I m_dim;

  public:
    /// Get dimension
    const Vector3I &getDim() const { return m_dim; }

    /// Set/change dimension without memory allocation
    void setDim(const Vector3I &s){
      // check shape consistency
      const int total = super_t::getSize();
      if (total<s.x()*s.y()*s.z()) {
        LString msg = LString::format("LByteArray.setShape: total size(%d) is smaller than (%d,%d,%d)", total, s.x(), s.y(), s.z());
        MB_THROW(IllegalArgumentException, msg);
        return;
      }
      /*
      if (m_nRank==2) {
        if (s.z()>1) {
          LString msg = LString::format("LByteArray.setShape: dim(%d) and shape(%d,%d,%d) mismatch",
                                        m_nRank, s.x(), s.y(), s.z());
          MB_THROW(IllegalArgumentException, msg);
          return;
        }
      }
      else if (m_nRank==1) {
        if (s.y()>1 || s.z()>1) {
          LString msg = LString::format("LByteArray.setShape: dim(%d) and shape(%d,%d,%d) mismatch",
                                        m_nRank, s.x(), s.y(), s.z());
          MB_THROW(IllegalArgumentException, msg);
          return;
        }
      }*/

      m_dim = s;
    }

    inline void resize(int x, int y, int z)
    {
      super_t::resize(x * y * z);
      m_dim = Vector3I(x,y,z);
    }
    inline void resize(const Vector3I &nsz)
    {
      super_t::resize(nsz.x()*nsz.y()*nsz.z());
      m_dim = nsz;
    }
    
    inline int cols() const { return m_dim.x(); }
    inline int rows() const { return m_dim.y(); }
    inline int secs() const { return m_dim.z(); }

    inline int getColumns() const { return m_dim.x(); }
    inline int getRows() const { return m_dim.y(); }
    inline int getSections() const { return m_dim.z(); }

    /// Conversion from 3D to linear access (FORTRAN order)
    inline int indf(int ix, int iy, int iz) const {
      //return iz + (iy + ix*m_dim.y())*m_dim.z();
      return ix + (iy + iz*m_dim.y())*m_dim.x();
    }

    /// Conversion from 2D to linear access (FORTRAN order)
    inline int indf(int ix, int iy) const {
      //return iy + ix*m_dim.y();
      return ix + iy*m_dim.x();
    }

    /// Conversion from 3D to linear access (C order)
    inline int indc(int ix, int iy, int iz) const {
      return iz + (iy + ix*m_dim.y())*m_dim.z();
    }

    /// Conversion from 2D to linear access (C order)
    inline int indc(int ix, int iy) const {
      return iy + ix*m_dim.y();
    }

    //////////

    const _Type &at(int i, int j, int k) const {
      return super_t::at(indf(i, j, k));
    }

    _Type &at(int i, int j, int k) {
      return super_t::at(indf(i, j, k));
    }

    //

    const _Type &at(int i, int j) const {
      return super_t::at(indf(i, j));
    }

    _Type &at(int i, int j) {
      return super_t::at(indf(i, j));
    }

    //

    const _Type &at(int i) const {
      return super_t::at(i);
    }

    _Type &at(int i) {
      return super_t::at(i);
    }

  };
  
  typedef qlib::Array3D<std::complex<float> > CompArray;
  typedef qlib::Array3D<float> FloatArray;
  typedef qlib::Array3D<qbyte> ByteArray;
}

#endif

