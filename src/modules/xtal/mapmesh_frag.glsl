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

out vec4 o_FragColor;

void main (void)
{
  o_FragColor = vec4(u_color.rgb, u_color.a * frag_alpha);
}
