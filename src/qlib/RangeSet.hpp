// -*-Mode: C++;-*-
//
// RangeSet : set of integer ranges
//
// $Id: RangeSet.hpp,v 1.6 2011/04/16 14:32:28 rishitani Exp $

#pragma once

#include "qlib.hpp"
#include "LString.hpp"

namespace qlib {

namespace detail {

// Generic version
template <typename _Type>
inline qlib::LString formatInvalidRange(const _Type &s, const _Type &e)
{
    return "Invalid range: start must be <= end";
}

// Specialization for int (shows actual values)
template <>
inline qlib::LString formatInvalidRange<int>(const int &s, const int &e)
{
    return qlib::LString::format("Invalid range: start(%d) > end(%d)", s, e);
}

///
/// Unit range data structure (nstart<= x < nend)
///
template <typename _Type>
struct Range
{
public:
    typedef _Type value_type;

    _Type nstart;
    _Type nend;

    Range(_Type s, _Type e) : nstart(s), nend(e)
    {
        // MB_ASSERT(s<=e);
        // MB_ASSERT(!(e < s));
        if (e < s) {
            MB_THROW(qlib::IllegalArgumentException, formatInvalidRange(s, e));
        }
    }

    int compare(const Range &t) const
    {
        // MB_ASSERT(isValid());
        if (nend < t.nstart) return -1;
        if (t.nend < nstart) return 1;
        return 0;
    }

    void merge(const Range &t)
    {
        if (t.nstart < nstart) nstart = t.nstart;
        if (nend < t.nend) nend = t.nend;
        // MB_ASSERT(isValid());
    }

    void remove(const Range &nr)
    {
        if (nr.nend < nend) nstart = nr.nend;
        if (nstart < nr.nstart) nend = nr.nstart;
        // MB_ASSERT(isValid());
    }

    bool equals(const Range &t) const
    {
        // MB_ASSERT(isValid());
        return (nstart == t.nstart && t.nend == nend);
    }

    bool includes(const Range &t) const
    {
        // MB_ASSERT(isValid());
        return (nstart < t.nstart && t.nend < nend);
    }

    bool contains(const Range &t) const
    {
        // MB_ASSERT(isValid());
        // return ( nstart<=t.nstart && t.nend<=nend );
        return (!(t.nstart < nstart) && !(nend < t.nend));
    }

    bool contains(const _Type &val) const
    {
        // MB_ASSERT(isValid());
        // return ( nstart<=val && val<nend );
        return (!(val < nstart) && val < nend);
    }

    bool empty() const
    {
        // MB_ASSERT(isValid());
        return (nstart == nend);
    }

    inline bool isValid() const
    {
        return (!(nend < nstart));
    }
};

}  // namespace detail

template <typename _Type>
class RangeSet
{
public:
protected:
    typedef detail::Range<_Type> elem_type;
    typedef std::list<elem_type> data_t;

    /// list of the unit ranges
    data_t m_data;

public:
    typedef typename data_t::const_iterator const_iterator;

public:
    RangeSet() {}

    RangeSet(const _Type &nstart, const _Type &nend)
    {
        append(nstart, nend);
    }

    RangeSet(const RangeSet &src) : m_data(src.m_data) {}

    ~RangeSet() {}

    const_iterator begin() const
    {
        return m_data.begin();
    }
    const_iterator end() const
    {
        return m_data.end();
    }

    const RangeSet &operator=(const RangeSet &arg)
    {
        if (&arg != this) {
            m_data = arg.m_data;
        }
        return *this;
    }

    /////////////////////////////////////////////////
    // add/remove selection

    void clear()
    {
        m_data.erase(m_data.begin(), m_data.end());
    }

    bool isEmpty() const
    {
        return m_data.empty();
    }

    size_t size() const
    {
        return m_data.size();
    }

    /// Append new unit range
    void append(const _Type &nstart, const _Type &nend)
    {
        assertConsistency("append:entry");  // DEBUG only
        // MB_ASSERT(checkConsistency());

        elem_type nr(nstart, nend);
        if (nr.empty()) {
            // empty range: no operation
            assertConsistency("append:exit");  // DEBUG only
            return;
        }

        if (m_data.empty()) {
            m_data.push_back(nr);
            assertConsistency("append:exit");  // DEBUG only
            return;
        }

        typename data_t::iterator iter2;
        typename data_t::iterator iter = m_data.begin();
        for (; iter != m_data.end();) {
            elem_type &tg = *iter;
            int res = nr.compare(tg);
            if (res == -1) {
                // nr is smaller than tg
                m_data.insert(iter, nr);
                assertConsistency("append:exit");  // DEBUG only
                return;
            }
            if (res == 0) {
                // nr overwraps with tg
                //   incorporate tg into nr and remove tg from m_data
                nr.merge(tg);
                iter2 = iter;
                ++iter;
                m_data.erase(iter2);
                continue;
            }
            ++iter;
        }

        // nr is larger than any elements in m_data
        m_data.insert(iter, nr);
        assertConsistency("append:exit");  // DEBUG only
    }

    void remove(const _Type &nstart, const _Type &nend)
    {
        // MB_ASSERT(checkConsistency());
        assertConsistency("remove:entry");  // DEBUG only

        if (m_data.empty()) return;

        elem_type nr(nstart, nend);
        if (nr.empty()) {
            // empty range: no operation
            assertConsistency("remove:exit");  // DEBUG only
            return;
        }
        if (m_data.empty()) {
            assertConsistency("remove:exit");  // DEBUG only
            return;
        }

        typename data_t::iterator iter2;
        typename data_t::iterator iter = m_data.begin();
        for (; iter != m_data.end();) {
            elem_type &tg = *iter;
            int res = nr.compare(tg);
            if (res == -1) {
                // nr is smaller than tg
                break;
            }
            if (res == 0) {
                // nr overwraps with tg
                // includes() is strict: [5,10) was not removed by remove(0,10)
                if (nr.contains(tg)) {
                    // nr covers tg --> remove tg
                    iter2 = iter;
                    ++iter;
                    m_data.erase(iter2);
                    continue;
                } else if (tg.includes(nr)) {
                    // nr is included in tg --> split tg into 2 elems
                    elem_type newr(tg.nstart, nr.nstart);
                    m_data.insert(iter, newr);
                    tg.nstart = nr.nend;
                } else {
                    tg.remove(nr);
                }
            }
            ++iter;
        }

        // MB_ASSERT(checkConsistency());
        assertConsistency("remove:exit");  // DEBUG only
    }

    // RangeSet negate() const {
    // }

    void merge(const RangeSet &r)
    {
        const data_t &rdat = r.m_data;
        typename data_t::const_iterator iter = rdat.begin();
        for (; iter != rdat.end(); ++iter) append(iter->nstart, iter->nend);
    }

    void remove(const RangeSet &r)
    {
        const data_t &rdat = r.m_data;
        typename data_t::const_iterator iter = rdat.begin();
        for (; iter != rdat.end(); ++iter) remove(iter->nstart, iter->nend);
    }

    bool contains(const _Type &nstart, const _Type &nend) const
    {
        typename data_t::const_iterator iter = m_data.begin();
        elem_type nr(nstart, nend);
        for (; iter != m_data.end(); ++iter)
            if (iter->contains(nr)) return true;
        return false;
    }

    bool contains(const _Type &val) const
    {
        typename data_t::const_iterator iter = m_data.begin();
        for (; iter != m_data.end(); ++iter)
            if (iter->contains(val)) return true;
        return false;
    }

    bool checkConsistency() const
    {
        if (m_data.size() <= 1) return true;

        typename data_t::const_iterator iter = m_data.begin();
        typename data_t::const_iterator iter2 = m_data.begin();
        typename data_t::const_iterator endi = m_data.end();
        ++iter2;
        for (; iter2 != endi; ++iter, ++iter2) {
            if (!(iter->nend < iter2->nstart)) return false;
            if (!iter->isValid()) return false;
        }

        if (!iter->isValid()) return false;

        return true;
    }

private:
  void assertConsistency(const char* ctx) const {
#ifdef MB_DEBUG
    if (!checkConsistency()) {
      MB_THROW(RuntimeException, 
               LString::format("Consistency failed at %s", ctx));
    }
#endif
  }

};  // class RangeSet<_Type>

using qlib::LString;

inline LString rangeToString(const RangeSet<int> &range)
{
    LString rval;
    RangeSet<int>::const_iterator ebegin = range.begin();
    RangeSet<int>::const_iterator eend = range.end();
    RangeSet<int>::const_iterator eiter = ebegin;
    for (; eiter != eend; ++eiter) {
        int nstart = eiter->nstart, nend = eiter->nend;
        if (eiter != ebegin) rval += ",";

        if (nstart == nend - 1)
            rval += LString::format("%d", nstart);
        else
            rval += LString::format("%d:%d", nstart, nend - 1);
    }

    return rval;
}

}  // namespace qlib
