#include "nodejs.hpp"

extern void node_jsbr_regClasses();
extern void node_jsbr_unregClasses();

namespace node_jsbr {

bool init()
{
    node_jsbr_regClasses();
    return true;
}

void fini()
{
    node_jsbr_unregClasses();
}

}  // namespace node_jsbr
