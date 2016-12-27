//
// Vector class with N dimension value
//

#ifndef __QLIB_VECTOR_ND_HPP__
#define __QLIB_VECTOR_ND_HPP__

#include "qlib.hpp"
#include "Utils.hpp"
#include "LExceptions.hpp"

namespace qlib {

  template <int _N_DIM, typename _ValueType = double>
  class VectorND
  {
  public:
    typedef _ValueType value_type;
    static const int dimension = _N_DIM;
    static const int _N_ELEM = _N_DIM*1;

  private:
    _ValueType m_value[_N_ELEM];

  public:
    /////////////////
    // constructors

    /// default constructor
    VectorND()
    {
      zero();
    }

    /// constructor without initialization
    explicit
    VectorND(int, detail::no_init_tag)
    {
    }

    /// copy constructor
    VectorND(const VectorND &arg)
    {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] = arg.m_value[i];
    }

    /// construction from ptr
    VectorND(const _ValueType *parg)
    {
      for (int i=0; i<_N_ELEM; ++i)
        m_value[i] = parg[i];
    }

  public:

    // FORTRAN-type (1-base index) access methods
    inline value_type ai(int i) const { return m_value[i-1]; }
    inline value_type &ai(int i) { return m_value[i-1]; }

    /////////////////////////
    // unary operators

    /// = assignment operator
    const VectorND &operator=(const VectorND &arg) {
      if(&arg!=this)
	for (int i=0; i<_N_ELEM; ++i)
	  m_value[i] = arg.m_value[i];
      return *this;
    }

    /// += addition operator
    const VectorND &operator+=(const VectorND &arg) {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] += arg.m_value[i];
      return *this;
    }

    /// -= subtraction operator
    const VectorND &operator-=(const VectorND &arg) {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] -= arg.m_value[i];
      return *this;
    }

    /// *= operator (scaling)
    const VectorND &operator*=(value_type arg)
    {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] *= arg;
      return *this;
    }

    /// /= operator (scaling)
    const VectorND &operator/=(value_type arg)
    {
      for (int i=0; i<_N_ELEM; ++i)
	m_value[i] /= arg;
      return *this;
    }

    /// - operator
    VectorND operator-() const
    {
      VectorND retval(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i)
	retval.m_value[i] = - m_value[i];
      return retval;
    }

    /// + operator 
    VectorND operator+()
    {
      return *this;
    }

    //////////////////////////////////////////
    // methods

    bool equals(const VectorND &arg, value_type dtol = value_type(F_EPS8)) const
    {
      for (int i=0; i<_N_ELEM; ++i) {
        if (! (qlib::abs<value_type>(m_value[i] - arg.m_value[i])<dtol) )
	  return false;
      }
      return true;
    }

    bool isZero(value_type dtol = value_type(F_EPS8)) const
    {
      for (int i=0; i<_N_ELEM; ++i) {
        if (! (qlib::abs<value_type>(m_value[i])<dtol) )
	  return false;
      }
      return true;
    }

    // square of vector length
    value_type sqlen() const
    {
      return dot(*this);
    }

    value_type length() const {
      return value_type(::sqrt(sqlen()));
    }

    /// Scaling by constant arg
    VectorND scale(value_type arg) const
    {
      VectorND ret(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i)
	ret.m_value[i] = m_value[i]*arg;
      return ret;
    }

    /// Scaling by constant arg (vector)
    VectorND scale(const VectorND &arg) const
    {
      VectorND ret(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i)
	ret.m_value[i] = m_value[i]*arg.m_value[i];
      return ret;
    }

    void scaleSelf(value_type arg) {
      for (int i=0; i<_N_ELEM; ++i) {
        this->m_value[i] *= arg;
      }
    }

    /// Division by constant arg
    VectorND divide(value_type arg) const
    {
      VectorND ret(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i)
	ret.m_value[i] = m_value[i]/arg;
      return ret;
    }

    void divideSelf(value_type arg) {
      for (int i=0; i<_N_ELEM; ++i) {
        this->m_value[i] /= arg;
      }
    }

    /// Division by constant arg (throws exception)
    VectorND divideThrows(value_type arg) const
    {
      if (isNear(arg, 0.0))
        MB_THROW(qlib::IllegalArgumentException, "Vector: zero division error");
      return divide(arg);
    }
    
    void divideSelfThrows(value_type arg) {
      if (isNear(arg, 0.0))
        MB_THROW(qlib::IllegalArgumentException, "Vector: zero division error");
      divideSelf(arg);
    }

    /// Add two vectors
    VectorND add(const VectorND &arg) const {
      VectorND retval(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i) {
	retval.m_value[i] = this->m_value[i] + arg.m_value[i];
      }
      return retval;
    }

    /// Add scalar
    VectorND add(value_type arg) const {
      VectorND retval(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i) {
	retval.m_value[i] = this->m_value[i] + arg;
      }
      return retval;
    }

    /// Add to this vector
    void addSelf(const _ValueType *parg) {
      for (int i=0; i<_N_ELEM; ++i) {
        this->m_value[i] += parg[i];
      }
    }

    VectorND sub(const VectorND &arg) const {
      VectorND retval(0, detail::no_init_tag());
      for (int i=0; i<_N_ELEM; ++i) {
	retval.m_value[i] = this->m_value[i] - arg.m_value[i];
      }
      return retval;
    }

    void subSelf(const _ValueType *parg) {
      for (int i=0; i<_N_ELEM; ++i) {
        this->m_value[i] -= parg[i];
      }
    }

    /// normalization (without zero check)
    VectorND normalize() const {
      return divide(length());
    }

    /// normalization (throws exception)
    VectorND normalizeThrows() const {
      return divideThrows(length());
    }

    /// inner (dot) product
    value_type dot(const VectorND &arg) const
    {
      value_type ret=0.0;
      for (int i=0; i<_N_ELEM; ++i)
	ret += m_value[i]*arg.m_value[i];
      return ret;
    }

    // clear this vector
    void zero() {
      for (int i=0; i<_N_ELEM; ++i)
        m_value[i] = value_type(0);
    }

    void set(const _ValueType *parg)
    {
      for (int i=0; i<_N_ELEM; ++i)
        m_value[i] = parg[i];
    }

    _ValueType *getData() { return &m_value[0]; }
    const _ValueType *getData() const { return &m_value[0]; }

  };

} // namespace qlib

#endif

