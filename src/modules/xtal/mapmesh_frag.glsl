// -*-Mode: C++;-*-
//
//  mapmesh_frag.glsl:
//    fragment shader
//

in float v_fogCoord;

// total transparency
uniform float frag_alpha;

// mesh color (RGB) set per-frame from the renderer's current color
uniform vec4 u_color;

out vec4 o_FragColor;

void main (void)
{
  o_FragColor = vec4(u_color.rgb, u_color.a * frag_alpha);
}

