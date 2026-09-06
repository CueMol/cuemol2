// -*-Mode: C++;-*-
//
//  Line fragment shader for the GPU ID-buffer pick pass (shared by the
//  linew2 / linew2idx / linevalidx pick vertex shaders)
//
#define varying in

#include "pick_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2 (LineGpuPrim::PickDrawParams layout)

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float lineWidth;    // offset 4
    float stippleLen;   // offset 8
    int   u_nodepth;    // offset 12
    vec2  screenSize;   // offset 16
    int   use_u_color;  // offset 24
    float _pad;         // offset 28
    vec4  u_color;      // offset 32
    PICK_DRAWPARAMS_TAIL  // offset 48
};

////////////////////
// Varying

flat varying uint v_hitName1;
flat varying uint v_hitName2;
varying float v_pickT;

layout(location = 0) out uvec4 o_Pick;

void main(void)
{
    // Each half of the segment picks its own endpoint.
    uint id = (v_pickT < 0.5) ? v_hitName1 : v_hitName2;
    if (id == 0u) discard;
    o_Pick = uvec4(u_rend_idx, id, u_outer_name, 0u);
}
