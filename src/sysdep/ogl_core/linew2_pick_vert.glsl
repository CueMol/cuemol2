// -*-Mode: C++;-*-
//
//  Wide-line vertex shader for the GPU ID-buffer pick pass
//
//  Same quad expansion as linew2_vert.glsl (linew_inc.glsl). Each endpoint
//  carries its own hit name; the fragment shader selects the name of the
//  nearer endpoint so both halves of a two-colored segment pick their own
//  atom.
//
#define attribute in
#define varying out

#include "matrices_inc.glsl"
#include "pick_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2 (LineGpuPrim::PickDrawParams)

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
// Vertex attributes (same VBO layout as linew2_vert.glsl)

layout(location = 0) in vec4 a_vertex1;
layout(location = 1) in vec4 a_vertex2;
layout(location = 2) in vec4 a_color1;
layout(location = 3) in vec4 a_color2;
// Encoded hit names of the two endpoints (integer attributes)
layout(location = 4) in uint a_hitName1;
layout(location = 5) in uint a_hitName2;

////////////////////
// Varying

flat varying uint v_hitName1;
flat varying uint v_hitName2;
// 0 at endpoint 1, 1 at endpoint 2 (interpolated along the segment)
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
    float vlength;
    float fogCoord;
    linew_func(0.0, vlength, fogCoord);

    if (u_nodepth > 0) {
        // billboarded line without depth
        gl_Position.z = -0.99;
        gl_Position.w = 1.0;
    }

    v_hitName1 = a_hitName1;
    v_hitName2 = a_hitName2;
    // Quad vertices 0/1 belong to endpoint 1, 2/3 to endpoint 2.
    v_pickT = (gl_VertexID < 2) ? 0.0 : 1.0;
}
