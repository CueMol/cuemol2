// -*-Mode: C++;-*-
//
// LString.h --- String class
//

#include <sstream>

#include "LObject.hpp"
#include "qlib.hpp"

#ifdef USE_HASH_MAP
#include "HashMap.hpp"
#endif

#ifndef L_STRING_H__
#define L_STRING_H__

namespace qlib {

namespace detail {
struct LLocale;
}

template <class T> using StringListContainer = std::list<T>;

class QLIB_API LString : public LObject
{
private:
    std::string m_data;

public:
    //////////////////////////////////
    // type defs
    typedef std::string::size_type size_type;
    typedef std::string::iterator iterator;
    typedef std::string::const_iterator const_iterator;

    //////////////////////////////////
    // constructors

    // Default Constructor
    LString() {}

    // Copy Constructor
    LString(const LString &arg) : m_data(arg.m_data) {}

    LString(const char *pstr) : m_data(pstr) {}

    LString(const char *pstr, size_type len) : m_data(pstr, len) {}

    explicit LString(char c, size_type cnt = 1) : m_data(cnt, c) {}

    template <typename _InputIterator>
    LString(_InputIterator i1, _InputIterator i2) : m_data(i1, i2)
    {
    }

    LString(const std::string &str) : m_data(str) {}

    /////////////////////////////////
    // destructor

    // virtual ~LString();

    /////////////////////////////////
    // member functions
    int length() const
    {
        return m_data.length();
    }

    bool isEmpty() const
    {
        return m_data.empty();
    }

    void append(const LString &arg)
    {
        m_data.append(arg.m_data);
    }
    void append(const char *arg)
    {
        m_data.append(arg);
    }
    void append(char c, size_type cnt = 1)
    {
        m_data.append(cnt, c);
    }

    const char *c_str() const
    {
        return m_data.c_str();
    }

    char getAt(size_type n) const
    {
        MB_ASSERT(n < m_data.length());
        return m_data[n];
    }

    LString substr(size_type off) const
    {
        return m_data.substr(off);
    }

    LString substr(size_type off, size_type cnt) const
    {
        return m_data.substr(off, cnt);
    }

    LString mid(int nFirst) const
    {
        return m_data.substr(nFirst);
    }

    LString mid(int nFirst, int nCount) const
    {
        return m_data.substr(nFirst, nCount);
    }

    LString right(int nCount) const
    {
        return m_data.substr(m_data.length() - nCount);
    }

    LString left(int nCount) const
    {
        return m_data.substr(0, nCount);
    }

    int compare(const LString &arg) const
    {
        return m_data.compare(arg.m_data);
    }

    int compare(const char *arg) const
    {
        return m_data.compare(arg);
    }

    bool equals(const LString &arg) const
    {
        return (m_data.compare(arg.m_data) == 0);
    }

    bool equals(const char *arg) const
    {
        return (m_data.compare(arg) == 0);
    }

    virtual int hash() const;

    LString toUpperCase() const
    {
        std::locale loc;
        std::string tmp(m_data);
        std::string::iterator i = tmp.begin();
        for (; i != tmp.end(); i++) {
            char c = *i;
            *i = (std::use_facet<std::ctype<char>>(loc).toupper(
                c));  // toupper<char>(c, loc);
        }
        return LString(tmp);
    }

    LString toLowerCase() const
    {
        std::locale loc;
        std::string tmp(m_data);
        std::string::iterator i = tmp.begin();
        for (; i != tmp.end(); i++) {
            char c = *i;
            *i = (std::use_facet<std::ctype<char>>(loc).tolower(
                c));  //*i = tolower(c, loc);
        }
        return LString(tmp);
    }

    bool equalsIgnoreCase(const LString &arg) const
    {
        LString arg1 = toUpperCase();
        LString arg2 = arg.toUpperCase();
        return arg1.equals(arg2);
    }

    bool equalsIgnoreCase(const char *arg) const
    {
        LString arg1 = toUpperCase();
        LString arg2 = LString(arg).toUpperCase();
        return arg1.equals(arg2);
    }

    int indexOf(char c) const
    {
        return m_data.find_first_of(c);
    }

    int indexOneOf(const LString &s) const
    {
        return m_data.find_first_of(s.m_data);
    }

    int indexOf(const LString &str) const
    {
        return m_data.find(str.m_data);
    }

    int lastIndexOf(char c) const
    {
        return m_data.find_last_of(c);
    }

    int lastIndexOf(const LString &str) const
    {
        return m_data.rfind(str);
    }

    int lastIndexOneOf(const LString &s) const
    {
        return m_data.find_last_of(s.m_data);
    }

    bool startsWith(const LString &s) const
    {
        return (indexOf(s) == 0);
    }

    bool endsWith(const LString &s) const
    {
        int npos = m_data.rfind(s.m_data);
        if (npos < 0) return false;
        return npos == (length() - s.length());
    }

    ///
    /// Replace all 'c' to 'to' (in place)
    /// @returns numbers of the replaced chars
    ///
    int replace(char c, char to);

    ///
    /// Replace all 'c' to 'to' (in place)
    /// @returns numbers of the replaced chars
    ///
    int replace(const LString &c, const LString &to);

    bool toInt(int *retval) const;

    template <typename _Type>
    bool toNum(_Type *retval) const
    {
        MB_ASSERT(retval != NULL);

        char *sptr;
        const char *cstr = m_data.c_str();
        *retval = (_Type)::strtol(cstr, &sptr, 0);
        if (sptr == cstr) return false;

        return true;
    }

    bool toDouble(double *retval) const;

    template <typename _Type>
    bool toRealNum(_Type *retval) const
    {
        MB_ASSERT(retval != NULL);

        char *sptr;
        const char *cstr = m_data.c_str();
        *retval = (_Type)::strtod(cstr, &sptr);
        if (sptr == cstr) return false;

        return true;
    }

    LString trim(const char *ws = " \t") const;

    LString escapeQuots() const;

    LString chomp(const char *ws = "\r\n") const;

    /// split string by the delimiter char, c
    int split(char c, StringListContainer<LString> &ls) const;

    /// split string by the delimiter char, one of s
    int split_of(const LString &s, StringListContainer<LString> &ls) const;

    static LString join(const char *sep, const StringListContainer<LString> &ls);
    static LString join(const char *sep, const LString *ps, int nsize);

    template <class InputIterator>
    static LString join(const char *sep, const InputIterator &istart,
                        const InputIterator &iend)
    {
        if (istart == iend) return LString();

        // estimate the result's length
        int nlen = 0;
        int nsep = ::strlen(sep);

        {
            InputIterator iter = istart;
            for (; iter != iend; ++iter) {
                const LString &elem = *iter;
                if (nlen == 0)
                    nlen += elem.length();
                else
                    nlen += (elem.length() + nsep);
            }
        }
        // construct the joined string
        std::string retval;
        retval.reserve(nlen);

        InputIterator iter = istart;
        for (; iter != iend; ++iter) {
            const LString &elem = *iter;

            if (iter == istart) {
                retval += elem;
            } else {
                retval += sep;
                retval += elem;
            }
        }

        return LString(retval);
    }

    ///////////////////////////////////////////
    // formatting/conversion methods

    void vformat(const char *msg, va_list marker);

    void format2(const char *fmt, ...);

    static LString format(const char *msg, ...);

    static inline LString fromBool(bool b)
    {
        return LString(b ? "true" : "false");
    }

    static LString fromReal(LReal value, int nMaxDigit = 6);

    template <typename _Type>
    static LString fromInt(_Type value)
    {
        std::stringstream ss;
        ss << value;
        return LString(ss.str());
    }

    ///////////////////////////////////////////
    // Iterators

    iterator begin()
    {
        return m_data.begin();
    }
    iterator end()
    {
        return m_data.end();
    }

    const_iterator begin() const
    {
        return m_data.begin();
    }
    const_iterator end() const
    {
        return m_data.end();
    }

    ///////////////////////////////////////////
    // member func. (operator)

    operator const char *() const
    {
        return m_data.c_str();
    }

    char operator[](int nIndex) const
    {
        return m_data[nIndex];
    }

    char &operator[](int nIndex)
    {
        return m_data[nIndex];
    }

    // = operator
    const LString &operator=(const LString &arg)
    {
        if (&arg != this) {
            m_data = arg.m_data;
        }
        return *this;
    }

    // += operator
    LString &operator+=(const LString &__str)
    {
        m_data.append(__str);
        return *this;
    }

    LString &operator+=(const char *__s)
    {
        m_data.append(__s);
        return *this;
    }

    LString &operator+=(char __c)
    {
        m_data.append(size_type(1), __c);
        return *this;
    }

    /** comparison of LString (this is used in container class of STL) */
    struct less_fcn : std::binary_function<LString, LString, bool>
    {
        bool operator()(const LString &x, const LString &y) const
        {
            return (::strcmp(x.c_str(), y.c_str()) < 0);
        }
    };

    /** comparison of LString (this is used in container class of STL) */
    struct equal_fcn : std::equal_to<LString>
    {
        bool operator()(const LString &x, const LString &y) const
        {
            return x.equals(y);
        }
    };

#ifdef USE_HASH_MAP
    /** hash function of LString (this is used in container class of STL) */
    struct hash_fcn
    {
        size_t operator()(const LString &x) const
        {
            return qlib::__stl_hash_string(x.c_str());
        }
    };
#endif

    friend LString operator+(const LString &arg1, const LString &arg2);
    friend LString operator+(const LString &arg, const char *pstr);
    friend LString operator+(const char *pstr, const LString &arg);
    friend LString operator+(const LString &arg, char c);
    friend LString operator+(char c, const LString &arg);

    // for debugging
    virtual void dump() const;

    // deprecated !!

    LString append2(const LString &arg) const
    {
        return m_data.c_str() + arg;
    }
    LString append2(char c) const
    {
        return m_data.c_str() + c;
    }

private:
    static detail::LLocale *m_pLocale;

public:
    static void initLocale();
    static void finiLocale();
};

inline LString operator+(const LString &arg1, const LString &arg2)
{
    return LString(arg1.m_data + arg2.m_data);
}
inline LString operator+(const LString &arg, const char *pstr)
{
    return LString(arg.m_data + pstr);
}
inline LString operator+(const char *pstr, const LString &arg)
{
    return LString(pstr + arg.m_data);
}
inline LString operator+(const LString &arg, char c)
{
    return LString(arg.m_data + c);
}
inline LString operator+(char c, const LString &arg)
{
    return LString(c + arg.m_data);
}

// Comparison
inline bool operator==(const LString &arg1, const LString &arg2)
{
    return arg1.equals(arg2);
}
inline bool operator==(const LString &arg, const char *pstr)
{
    return arg.equals(pstr);
}
inline bool operator==(const char *pstr, const LString &arg)
{
    return arg.equals(pstr);
}

inline bool operator<(const LString &arg1, const LString &arg2)
{
    return (arg1.compare(arg2) < 0);
}
inline bool operator<(const LString &arg1, const char *arg2)
{
    return (arg1.compare(arg2) < 0);
}
inline bool operator<(const char *arg1, const LString &arg2)
{
    return (arg2.compare(arg1) > 0);
}

using LStringList = StringListContainer<LString>;

}  // namespace qlib

#endif  // L_STRING_H__
