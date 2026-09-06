// -*-Mode: C++;-*-
//
//  Triangle vertex shader for the GPU ID-buffer pick pass
//
#define varying out

#include "matrices_inc.glsl"
#include "pick_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2 (TrigGpuPrim::PickDrawParams)

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;       // offset 0  (unused)
    int   enable_lighting;  // offset 4  (unused)
    int   u_nodepth;        // offset 8
    float _pad;             // offset 12
    PICK_DRAWPARAMS_TAIL    // offset 16
};

////////////////////
// Vertex attributes (same VBO layout as trig_vert.glsl)

layout(location = 0) in vec4 aVertex;
// Encoded hit name (integer attribute; locations 1/2 = normal/color unused)
layout(location = 3) in uint aHitName;

////////////////////
// Varying variables

flat varying uint v_hitName;

void main(void)
{
    vec4 ecPosition = u_ModelViewMatrix * aVertex;
    gl_Position = u_ProjectionMatrix * ecPosition;

    if (u_nodepth > 0) {
        // billboarded geometry without depth
        gl_Position.z = -0.99;
        gl_Position.w = 1.0;
    }

    v_hitName = aHitName;
}
