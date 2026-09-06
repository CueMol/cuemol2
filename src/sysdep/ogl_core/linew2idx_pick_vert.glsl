// -*-Mode: C++;-*-
//
//  Wide-line vertex shader with texture-fetched endpoints: GPU ID-buffer
//  pick pass (see linew2idx_vert.glsl / linew2_pick_vert.glsl).
//
#define attribute in
#define varying out

#include "matrices_inc.glsl"
#include "lib_atoms.glsl"
#include "pick_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2 (LineIdxGpuPrim::PickDrawParams)

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
// Vertex attributes (same VBO layout as linew2idx_vert.glsl)

layout(location = 0) in vec4 a_p1;
layout(location = 1) in vec4 a_p2;
layout(location = 2) in vec4 a_color1;
layout(location = 3) in vec4 a_color2;
// Encoded hit names of the two endpoints (integer attributes)
layout(location = 4) in uint a_hitName1;
layout(location = 5) in uint a_hitName2;

uniform sampler2D u_coordTex;

////////////////////
// Endpoint positions consumed by linew_func() (globals, filled in main)

vec4 a_vertex1;
vec4 a_vertex2;

////////////////////
// Varying

flat varying uint v_hitName1;
flat varying uint v_hitName2;
varying float v_pickT;

// Consumed by linew_func (no fog in the pick pass)
vec4 v_frontColor;
float ffog(in float d)
{
    return 0.0;
}

#include "linew_inc.glsl"

void main(void)
{
    a_vertex1 = vec4(getAtomPos3(u_coordTex, int(a_p1.w)) + a_p1.xyz, 1.0);
    a_vertex2 = vec4(getAtomPos3(u_coordTex, int(a_p2.w)) + a_p2.xyz, 1.0);

    float vlength;
    float fogCoord;
    linew_func(0.0, vlength, fogCoord);

    if (u_nodepth > 0) {
        gl_Position.z = -0.99;
        gl_Position.w = 1.0;
    }

    v_hitName1 = a_hitName1;
    v_hitName2 = a_hitName2;
    v_pickT = (gl_VertexID < 2) ? 0.0 : 1.0;
}
