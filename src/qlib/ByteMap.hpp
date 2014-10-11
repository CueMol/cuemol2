// -*-Mode: C++;-*-
//
// Array3D.h
//   3D array class Array3D
//

#ifndef QLIB_ARRAY_3D_HPP
#define QLIB_ARRAY_3D_HPP

namespace qlib {

  template <class T>
  class Array3D
  {
  public:
    typedef T value_type;

  private:
    T *m_array;

    // number of columns, rows, sections
    int m_nCols;
    int m_nRows;
    int m_nSecs;

  public:
    Array3D() : m_array(NULL), m_nCols(0), m_nRows(0), m_nSecs(0)
    {
    }

    Array3D(int ncol, int nrow, int nsect)
      : m_nCols(ncol), m_nRows(nrow), m_nSecs(nsect)
    {
      m_array = MB_NEW T[getSize()];
    }

    Array3D(int ncol, int nrow, int nsect, const T *p)
      : m_nCols(ncol), m_nRows(nrow), m_nSecs(nsect)
    {
      m_array = MB_NEW T[ncol*nrow*nsect];
      for (int i=0; i<ncol*nrow*nsect; i++)
	m_array[i] = p[i];
    }

    Array3D(const Array3D<T> &arg)
      : m_nCols(arg.m_nCols), m_nRows(arg.m_nRows), m_nSecs(arg.m_nSecs)
    {
      m_array = MB_NEW T[arg.getSize()];
      for(int i=0; i<arg.getSize(); i++)
	m_array[i] = arg[i];
    }

    ~Array3D() {
      if(m_array!=NULL) delete [] m_array;
    }

    // member methods
    int getSize() const { return m_nCols*m_nRows*m_nSecs; }
    int getColumns() const { return m_nCols; }
    int getRows() const { return m_nRows; }
    int getSections() const { return m_nSecs; }

    int size() const { return getSize(); }
    int cols() const { return getColumns(); }
    int rows() const { return getRows(); }
    int secs() const { return getSections(); }

    void resize(int ncol, int nrow, int nsect)
    {
      if(m_array!=NULL) delete [] m_array;
      m_nCols = ncol;
      m_nRows = nrow;
      m_nSecs = nsect;
      m_array = MB_NEW T[getSize()];
    }

    void clear()
    {
      if(m_array!=NULL) delete [] m_array;
      m_array = NULL;
      m_nCols = 0;
      m_nRows = 0;
      m_nSecs = 0;
    }

    const T &at(int i, int j, int k) const {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nCols);
      MB_ASSERT(j>=0); MB_ASSERT(j<m_nRows);
      MB_ASSERT(k>=0); MB_ASSERT(k<m_nSecs);
      return m_array[i + (j + k*m_nRows)*m_nCols];
    }

    T &at(int i, int j, int k) {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nCols);
      MB_ASSERT(j>=0); MB_ASSERT(j<m_nRows);
      MB_ASSERT(k>=0); MB_ASSERT(k<m_nSecs);
      return m_array[i + (j + k*m_nRows)*m_nCols];
    }

    // 2-D access
    const T &at(int i, int j) const {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nCols);
      MB_ASSERT(j>=0); MB_ASSERT(j<m_nRows);
      return m_array[i + j*m_nCols];
    }

    T &at(int i, int j) {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nCols);
      MB_ASSERT(j>=0); MB_ASSERT(j<m_nRows);
      return m_array[i + j*m_nCols];
    }

    const T *data() const { return m_array; }
    operator const T *() const { return m_array; }

    const Array3D<T> &operator =(const Array3D<T> &arg)
    {
      if(&arg!=this){
	if(m_array!=NULL)	delete [] m_array;
	m_array = MB_NEW T[arg.getSize()];

	m_nCols = arg.m_nCols;
	m_nRows = arg.m_nRows;
	m_nSecs = arg.m_nSecs;
	for(int i=0; i<arg.getSize(); i++)
	  m_array[i] = arg[i];
      }
      return *this;
    }

    void dump() const
    {
      //    DPRINT("Array dump:");
      //    for(int i=0; i<m_nSize; i++)
      //      DPRINT(":%X",(int)m_array[i]);
      //    DPRINTLN("");
    }
  };

  typedef Array3D<unsigned char> ByteMap;

}

#endif
