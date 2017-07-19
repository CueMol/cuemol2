//
// NxN square matrix class
//

#ifndef __QLIB_MATRIX_ND_H__
#define __QLIB_MATRIX_ND_H__

#include "qlib.hpp"
#include "Utils.hpp"

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
    explicit
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

    MatrixND mul(const MatrixND &arg) const {
      MatrixND retval(0, detail::no_init_tag());
      for (int i=1; i<=_N_DIM; ++i) {
	for (int j=1; j<=_N_DIM; ++j) {
	  value_type sum=0.0;
	  for (int k=1; k<=_N_DIM; ++k) {
	    sum += this->aij(i,k) * arg.aij(k,j);
	  }
	  retval.aij(i,j) = sum;
	}
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

    /// Copy (impl for copy ctor and = op)
    void copyElems(const MatrixND &arg) {
      for (int i=0; i<_N_ELEM; ++i)
        m_value[i] = arg.m_value[i];
    }

    /// I-Element access (mutating)
    value_type &ai(int i) {
      MB_ASSERT(0<i);
      MB_ASSERT(i<=_N_ELEM);
      return m_value[i-1];
    }

    /// I-Element access (const)
    value_type ai(int i) const {
      MB_ASSERT(0<i);
      MB_ASSERT(i<=_N_ELEM);
      return m_value[i-1];
    }

    /// IJ Element access (mutating)
    value_type &aij(int i, int j) {
      return m_value[(i-1) + (j-1)*_N_DIM];
    }

    /// IJ Element access (const)
    value_type aij(int i, int j) const {
      return m_value[(i-1) + (j-1)*_N_DIM];
    }

    // /** get inverse matrix */
    // MatrixND invert() const;

    /// Calculate matrix product ( this = this * arg )
    void matprod(const MatrixND & arg) {
      MatrixND retval(0, detail::no_init_tag());
      retval = this->mul(arg);
      copyElems(retval);
      //for (int i=0; i<_N_ELEM; ++i)
      //m_value[i] = retval.m_value[i];
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
	  aij(i,j) = delta(i,j);
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
	if (! (qlib::abs<value_type>(m_value[i] - arg.m_value[i])<dtol) )
	  return false;
      }
      return true;
    }

    bool isZero(value_type dtol = F_EPS8) const
    {
      for (int i=0; i<_N_ELEM; ++i) {
	if (! (qlib::abs<value_type>(m_value[i])<dtol) )
	  return false;
      }
      return true;
    }

    /** Is identity matrix or not? */
    bool isIdent(value_type dtol = F_EPS8) const {
      for (int i=1; i<=_N_DIM; ++i) {
	for (int j=1; j<=_N_DIM; ++j) {
	  if (! (qlib::abs<value_type>(aij(i,j) - delta(i,j))<dtol) )
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

