//
// Scriptable version of the integer rangeset object
//

#ifndef L_SCR_RANGESET_HPP__
#define L_SCR_RANGESET_HPP__

#include "LScrObjects.hpp"
#include "RangeSet.hpp"
#include "mcutils.hpp"
#include "qlib.hpp"

namespace qlib {

class QLIB_API LScrRangeSet : public LSimpleCopyScrObject, public RangeSet<int>
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;
    typedef RangeSet<int> super_t;

public:
    // constructors

    /// default constructor
    LScrRangeSet() {}

    /// copy constructor
    LScrRangeSet(const LScrRangeSet &arg) : super_t(arg) {}

    /// Implicit conversion
    LScrRangeSet(const super_t &arg) : super_t(arg) {}

    /// destructor
    virtual ~LScrRangeSet();

    /// Assignment operator
    const LScrRangeSet &operator=(const LScrRangeSet &arg)
    {
        if (&arg != this) {
            super_t::operator=(arg);
        }
        return *this;
    }

public:
    LScrRangeSet negate() const;

    LScrRangeSet scr_append(const qlib::LScrRangeSet &rng);
    LScrRangeSet scr_appendInt(int nst, int nen);
    LScrRangeSet scr_remove(const qlib::LScrRangeSet &rng);
    LScrRangeSet scr_removeInt(int nst, int nen);

    void dump() const;

    // virtual bool equals(const LScrRangeSet &arg) const;
    virtual bool isStrConv() const;
    virtual LString toString() const;

    virtual bool fromString(const LString &src);

    //

    typedef boost::true_type has_fromString;
    static LScrRangeSet *fromStringS(const LString &src);
};

}  // namespace qlib

#endif
