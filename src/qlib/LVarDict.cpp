#include <common.h>

#include "LVarDict.hpp"

namespace qlib {

LVarDict::LVarDict(const LVarDict &a) : super_t(a) {}

LVarDict::~LVarDict()
{
    // super_t::iterator i = super_t::begin();
    // super_t::iterator e = super_t::end();
    // for (; i != e; ++i) {
    //     if (i->second!=NULL)
    //         delete i->second;
    // }
}

void LVarDict::dump() const
{
    super_t::const_iterator i = super_t::begin();
    super_t::const_iterator e = super_t::end();
    for (auto &&elem : *this) {
        MB_DPRINT("%s->", elem.first.c_str());
        elem.second.dump();

        // if (elem.second != NULL) {
        //     elem.second->dump();
        // }
    }
}

}  // namespace qlib
