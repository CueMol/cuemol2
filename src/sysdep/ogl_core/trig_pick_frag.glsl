// -*-Mode: C++;-*-
//
//  Triangle fragment shader for the GPU ID-buffer pick pass
//
#define varying in

#include "pick_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2 (TrigGpuPrim::PickDrawParams)

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;       // offset 0
    int   enable_lighting;  // offset 4
    int   u_nodepth;        // offset 8
    float _pad;             // offset 12
    PICK_DRAWPARAMS_TAIL    // offset 16
};

////////////////////
// Varying variables

flat varying uint v_hitName;

// The pick target has a single unsigned-integer attachment.
layout(location = 0) out uvec4 o_Pick;

void main(void)
{
    // Geometry without a name must not occlude pickable geometry behind it.
    if (v_hitName == 0u) discard;
    o_Pick = uvec4(u_rend_idx, v_hitName, u_outer_name, 0u);
}
