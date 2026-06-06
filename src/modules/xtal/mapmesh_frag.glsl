// -*-Mode: C++;-*-
//
//  mapmesh_frag.glsl:
//    fragment shader
//

in float v_fogCoord;

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;  // offset 0
    int   ncol;        // offset 4
    int   nrow;        // offset 8
    int   isolevel;    // offset 12
    vec4  u_color;     // offset 16
};

layout(location = 0) out vec4 o_FragColor;
// Wireframe mesh has no usable surface normal: write the sentinel (0,0,0) so
// GTAO leaves these pixels unshaded. vec4 to match o_FragColor (Apple Metal GL
// mishandles mixed vec4/vec3 MRT).
layout(location = 1) out vec4 o_Normal;

void main (void)
{
  o_FragColor = vec4(u_color.rgb, u_color.a * frag_alpha);
  o_Normal = vec4(0.0, 0.0, 0.0, 1.0);
}
