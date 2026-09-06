// -*-Mode: C++;-*-
//
//  Valence-aware wide-line vertex shader (SimpleRenderer stick model): GPU
//  ID-buffer pick pass. Same geometry as linevalidx_vert.glsl; the two
//  endpoints carry their own hit names (linew_pick_frag.glsl selects the
//  nearer one, so each half of a bond picks its own atom).
//
#define attribute in
#define varying out

#include "matrices_inc.glsl"
#include "lib_atoms.glsl"
#include "pick_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2 (LineValIdxGpuPrim::PickDrawParams)

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
// Vertex attributes (same VBO layout as linevalidx_vert.glsl)

layout(location = 0) in vec4 a_p1;
layout(location = 1) in vec4 a_p2;
layout(location = 2) in vec4 a_val;
layout(location = 3) in vec4 a_color1;
layout(location = 4) in vec4 a_color2;
// Encoded hit names of the two endpoints (integer attributes)
layout(location = 5) in uint a_hitName1;
layout(location = 6) in uint a_hitName2;

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

// Same displacement rule as linevalidx_vert.glsl (kept identical so the
// pick geometry matches what is drawn).
vec3 calcDispDir(in vec3 p1, in vec3 p2, in float idxd)
{
    vec3 ebond = normalize(p2 - p1);

    if (idxd >= 0.0) {
        vec3 pd = getAtomPos3(u_coordTex, int(idxd));
        vec3 v2 = pd - p1;
        float v2len = length(v2);
        vec3 d = v2 - ebond * dot(ebond, v2);
        if (v2len > 1.0e-4 && length(d) > 0.15 * v2len) {
            return normalize(d);
        }
    }

    mat3 mv3 = mat3(u_ModelViewMatrix);
    vec3 ecb = normalize(mv3 * ebond);
    vec3 ecp = vec3(-ecb.y, ecb.x, 0.0);
    float pl = length(ecp);
    if (pl < 1.0e-4) {
        ecp = vec3(1.0, 0.0, 0.0);
    } else {
        ecp /= pl;
    }
    return normalize(inverse(mv3) * ecp);
}

void main(void)
{
    vec3 p1 = getAtomPos3(u_coordTex, int(a_p1.w));
    vec3 p2 = getAtomPos3(u_coordTex, int(a_p2.w));

    vec3 base1 = mix(p1, p2, a_val.x);
    vec3 base2 = mix(p1, p2, a_val.y);

    vec3 disp = vec3(0.0);
    if (a_val.z != 0.0) {
        disp = calcDispDir(p1, p2, a_val.w) * a_val.z;
    }

    a_vertex1 = vec4(base1 + a_p1.xyz + disp, 1.0);
    a_vertex2 = vec4(base2 + a_p2.xyz + disp, 1.0);

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
