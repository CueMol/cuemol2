// -*-Mode: C++;-*-
//
//  vertex shader body for cylinders (predefined attribute locations)
//
//  Included by cylinder_vertex.glsl (direct position) and
//  cylinder_idx_vertex.glsl (coordinate texture). Do not add to
//  GLSL_SHADER_FILES; it is an include-only body.
//
#define varying out

#include <matrices_inc.glsl>

#ifdef USE_COORD_TEX
#include <lib_atoms.glsl>
#endif

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float u_edge;       // offset 4
    int   u_bsilh;      // offset 8
    float _pad;         // offset 12
    vec4  u_edgecolor;  // offset 16
};

////////////////////
// Vertex attributes (predefined locations)

#ifdef USE_COORD_TEX
// x = index of endpoint 1, y = index of endpoint 2 (into the coordinate
// texture). z = this vertex's parameter along the bond, w = the other end's
// parameter (0 -> pos1, 1 -> pos2, 0.5 -> midpoint). This lets one primitive
// draw a full bond (0..1) or a bicolour half (0..0.5, 0.5..1) with the split
// point computed in the shader so it follows the atoms.
layout(location = 0) in vec4 a_cyl;
uniform sampler2D u_coordTex;
#else
// position
layout(location = 0) in vec3 a_vertex;

// direction (oth-pos)
layout(location = 1) in vec3 a_dir;
#endif

// impostor
layout(location = 2) in vec2 a_impos;

// radius
layout(location = 3) in float a_radius;

// color
layout(location = 4) in vec4 a_color;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;

varying float v_ndec;
varying float v_flag;
varying float v_depmx;
varying vec2 v_normadj;
varying mat2 v_normmat;

////////////////////
// Program

void main()
{
#ifdef USE_COORD_TEX
  vec3 p1 = getAtomPos3(u_coordTex, int(a_cyl.x));
  vec3 p2 = getAtomPos3(u_coordTex, int(a_cyl.y));
  vec3 a_vertex = mix(p1, p2, a_cyl.z);
  vec3 a_dir = mix(p1, p2, a_cyl.w) - a_vertex;
#endif

  vec4 ec_tpos = u_ModelViewMatrix * vec4(a_vertex, 1.0);
  vec4 ec_opos = u_ModelViewMatrix * vec4((a_vertex+a_dir), 1.0);

  vec4 ec_dir = ec_opos - ec_tpos;
  vec2 n_vwdir = normalize(ec_dir.xy);
  vec3 n_ecdir = normalize(ec_dir.xyz);

  vec4 iec_dir = ec_dir * a_impos.y;
  vec2 n_ivwdir = normalize(iec_dir.xy);
  vec3 n_iecdir = normalize(iec_dir.xyz);

  float len = length(ec_dir.xyz);
  float vw_len = length(ec_dir.xy);

  float sinph = ec_dir.z / len;
  float rcosph = inversesqrt(1.0-sinph*sinph);
  float tanph = sinph * rcosph;
  float dec = a_radius * sinph;
  vec3 dec_dir = a_radius * tanph * n_ecdir;

  v_ndec = 2.0 * abs(dec) / vw_len;

  v_flag = sign( iec_dir.z );

  v_depmx = a_radius * rcosph;

  v_normadj = vec2(-sinph * a_impos.y, 1.0/rcosph);
  v_normmat = mat2(n_ivwdir.x, n_ivwdir.y,
                   -n_ivwdir.y, n_ivwdir.x);

  /////

  vec3 vert_dsp = vec3(-n_ivwdir.y,n_ivwdir.x,0);
  vert_dsp *= a_impos.x * (a_radius + u_edge);

  v_impos = a_impos;

  if ( dec > 0.0 ) {
    // extend the end of the cap
    vert_dsp -= dec_dir;

    v_impos.y *= 1.0 + v_ndec;
  }
  v_impos.x *= 1.0 + u_edge/a_radius;

  vec4 ec_pos_dsp = ec_tpos + vec4(vert_dsp, 0.0);
  gl_Position = u_ProjectionMatrix * ec_pos_dsp;

  v_color = a_color;
  v_ecpos = ec_pos_dsp;
}
