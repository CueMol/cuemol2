//
// NxN square matrix class
//

#ifndef __QLIB_MATRIX_ND_H__
#define __QLIB_MATRIX_ND_H__

#include "qlib.hpp"
#include "Utils.hpp"
#include "VectorND.hpp"

namespace qlib {

  template <int _N_DIM, typename _ValueType = double>
  class MatrixND
  {
  public:
    typedef _ValueType value_type;
    static const int dimension = _N_DIM;
    static const int _N_ELEM = _N_DIM * _N_DIM;

  private:
    value_type m_value[_N_ELEM];

  public:
    // constructors

    /// Default constructor with creating unit matrix
    MatrixND()
    {
      setIdent();
    }

    /// Constructor without initialization
    MatrixND(int, detail::no_init_tag)
    {
    }

    /// Copy constructor
    MatrixND(const MatrixND &arg)
    {
      copyElems(arg);
    }

    /// Copy constructor from different dimension
    template <int _M_DIM> explicit
    MatrixND(const MatrixND<_M_DIM, value_type> &arg)
    {
      setIdent();
      const int ncopy = (_M_DIM<_N_DIM)?_M_DIM:_N_DIM;
      for (int i=1; i<=ncopy; ++i)
        for (int j=1; j<=ncopy; ++j)
          aij(i,j) = arg.aij(i,j);
    }

    /// Type Conversion
    template <typename _ArgType>
    explicit
    MatrixND(const MatrixND<dimension, _ArgType> &arg)
    {
      copyElems(arg);
    }

    ////////////////////////////////////////////////////////////
    // operators

  public:

    /// = operator
    const MatrixND &operator=(const MatrixND &arg)
    {
      if(&arg!=this)
        copyElems(arg);
      return *this;
    }

    /// += operator
    const MatrixND &operator+=(const MatrixND &arg)
    {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] += arg.m_value[i];
      return *this;
    }

    /// -= operator
    const MatrixND &operator-=(const MatrixND &arg)
    {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] -= arg.m_value[i];
      return *this;
    }

    /// *= operator (scaling)
    const MatrixND &operator*=(value_type arg)
    {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] *= arg;
      return *this;
    }

    /// /= operator (scaling)
    const MatrixND &operator/=(value_type arg)
    {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] /= arg;
      return *this;
    }

    /// - operator
    MatrixND operator-() const
    {
      MatrixND retval(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i)
	retval.m_value[i] = - m_value[i];
      return retval;
    }

    /// + operator
    MatrixND operator+()
    {
      return *this;
    }

    // Non-destructive methods

    MatrixND scale(value_type arg) const
    {
      MatrixND ret(*this);
      ret *= arg;
      return ret;
    }
    
    MatrixND divide(value_type arg) const
    {
      MatrixND ret(*this);
      ret /= arg;
      return ret;
    }

    MatrixND add(const MatrixND &arg) const {
      MatrixND retval(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i) {
	retval.m_value[i] = this->m_value[i] + arg.m_value[i];
      }
      return retval;
    }

    MatrixND sub(const MatrixND &arg) const {
      MatrixND retval(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i) {
	retval.m_value[i] = this->m_value[i] - arg.m_value[i];
      }
      return retval;
    }

    /// Returns a matrix this*mat with the same dim
    MatrixND mul(const MatrixND &arg) const {
      MatrixND retval(0, detail::no_init_tag());
      for (int i=1; i<=_N_DIM; ++i) {
	for (int j=1; j<=_N_DIM; ++j) {
	  value_type sum = value_type(0);
	  for (int k=1; k<=_N_DIM; ++k) {
	    sum += this->aij(i,k) * arg.aij(k,j);
	  }
	  retval.aij(i,j) = sum;
	}
      }
      return retval;
    }
    
    /// Returns a vector this*vec
    VectorND<dimension, value_type> mulvec(const VectorND<dimension, value_type> &arg) const
    {
      VectorND<dimension, value_type> retval(0, detail::no_init_tag());
      for (int i=1; i<=dimension; ++i) {
	value_type sum = value_type(0);
	for (int j=1; j<=dimension; ++j) {
	  sum += this->aij(i,j) * arg.ai(j);
	}
	retval.ai(i) = sum;
      }
      return retval;
    }


    MatrixND transpose() const {
      MatrixND retval(0, detail::no_init_tag());
      for (int i=1; i<=_N_DIM; ++i) {
        for (int j=1; j<=_N_DIM; ++j) {
          retval.aij(j,i) = aij(i,j);
	}
      }

      return retval;
    }

    ////////////////////////////////////////////////////////////

    /// Element access (mutating)
    inline value_type &aij(int i, int j) {
      return m_value[(i-1) + (j-1)*_N_DIM];
    }

    /// Element access (const)
    inline value_type aij(int i, int j) const {
      return m_value[(i-1) + (j-1)*_N_DIM];
    }

    /// Element access (linear/mutating)
    inline value_type &ai(int i) {
      return m_value[(i-1)];
    }

    /// Element access (linear/const)
    inline value_type ai(int i) const {
      return m_value[(i-1)];
    }

    /// Copy (impl for copy ctor and = op)
    template <typename _ArgType>
    inline void copyElems(const MatrixND<dimension, _ArgType> &arg) {
      for (int i=1; i<=_N_ELEM; ++i)
        ai(i) = value_type( arg.ai(i) );
    }

    /// Get row
    VectorND<dimension, value_type> getRow(int i) const {
      VectorND<dimension, value_type> retval(0, detail::no_init_tag());
      for (int j=1; j<=dimension; ++j)
	retval.ai(i) = aij(i, j);
      return retval;
    }

    /// Get column
    VectorND<dimension, value_type> getColumn(int i) const {
      VectorND<dimension, value_type> retval(0, detail::no_init_tag());
      for (int j=1; j<=dimension; ++j)
	retval.ai(i) = aij(j, i);
      return retval;
    }

    /// Swap two rows
    void swapRows(int i, int j) {
      for (int k=1; k<=dimension; ++k) {
	value_type tmp = aij(i, k);
	aij(i, k) = aij(j, k);
	aij(j, k) = tmp;
      }
    }

    /// Swap two columns
    void swapColumns(int i, int j) {
      for (int k=1; k<=dimension; ++k) {
	value_type tmp = aij(k, i);
	aij(k, i) = aij(k, j);
	aij(k, j) = tmp;
      }
    }

    // /** get inverse matrix */
    // MatrixND invert() const;

    /// Calculate matrix product ( this = this * arg )
    void matprod(const MatrixND & arg) {
      // Copy of this mat is required not to disrupt this mat.
      MatrixND retval(0, detail::no_init_tag());
      retval = this->mul(arg);
      copyElems(retval);
    }

    /// Returns Kronecker's delta
    inline static int delta(int i, int j) {
      return (i==j)?1:0;
    }

    /// for compatibility
    inline void setUnit() { setIdent(); }

    inline void setIdent() {
      for (int i=1; i<=_N_DIM; ++i)
	for (int j=1; j<=_N_DIM; ++j)
	  aij(i,j) = value_type( delta(i,j) );
    }

    inline void setZero() {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] = value_type(0);
    }

    /////////////////////////////////////////////
    // comparison

    bool equals(const MatrixND &arg, value_type dtol = F_EPS8) const
    {
      for (int i=0; i<_N_ELEM; ++i) {
	if (! (qlib::abs<value_type>(m_value[i] - arg.m_value[i])<=dtol) )
	  return false;
      }
      return true;
    }

    bool isZero(value_type dtol = F_EPS8) const
    {
      for (int i=0; i<_N_ELEM; ++i) {
	if (! (qlib::abs<value_type>(m_value[i])<=dtol) )
	  return false;
      }
      return true;
    }

    /// Is identity matrix or not?
    bool isIdent(value_type dtol = F_EPS8) const {
      for (int i=1; i<=_N_DIM; ++i) {
	for (int j=1; j<=_N_DIM; ++j) {
	  if (! (qlib::abs<value_type>(aij(i,j) - delta(i,j))<=dtol) )
	    return false;
	}
      }
      return true;
    }

  };

  // Definitions of non-member binary operator functions

  template <int _N_DIM, typename _ValueType>
  inline MatrixND<_N_DIM,_ValueType> operator+(const MatrixND<_N_DIM,_ValueType> &p1,const MatrixND<_N_DIM,_ValueType> &p2)
  {
    return p1.add(p2);

  }

  template <int _N_DIM, typename _ValueType>
  inline MatrixND<_N_DIM,_ValueType> operator-(const MatrixND<_N_DIM,_ValueType> &p1,const MatrixND<_N_DIM,_ValueType> &p2)
  {
    return p1.sub(p2);
  }

  template <int _N_DIM, typename _ValueType>
  inline MatrixND<_N_DIM,_ValueType> operator*(const MatrixND<_N_DIM,_ValueType> &p1,const MatrixND<_N_DIM,_ValueType> &p2)
  {
    return p1.mul(p2);
  }

  template <int _N_DIM, typename _ValueType>
  inline bool operator==(const MatrixND<_N_DIM,_ValueType> &p1,const MatrixND<_N_DIM,_ValueType> &p2)
  {
    return p1.equals(p2);
  }

}

#endif // MATRIX_4D_H__

