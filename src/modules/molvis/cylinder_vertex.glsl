// -*-Mode: C++;-*-
//
//  vertex shader for cylinders
//

////////////////////
// Uniform variables

// edge rendering
uniform float u_edge;

////////////////////
// Vertex attributes

// position
attribute vec3 a_vertex;

// direction (oth-pos)
attribute vec3 a_dir;

// radius
attribute float a_radius;

// color
attribute vec4 a_color;

// impostor
attribute vec2 a_impos;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;

varying float v_ndec;
//varying float v_dec;
//varying float vw_len;
//varying float v_sinph;
varying float v_flag;
varying float v_depmx;
varying vec2 v_normadj;
//varying vec2 v_vwdir;
varying mat2 v_normmat;

////////////////////
// Program

void main()
{
  //const float u_edge = 0.05;

  vec4 ec_tpos = gl_ModelViewMatrix * vec4(a_vertex, 1.0);
  vec4 ec_opos = gl_ModelViewMatrix * vec4((a_vertex+a_dir), 1.0);
  
  vec4 ec_dir = ec_opos - ec_tpos;
  vec2 n_vwdir = normalize(ec_dir.xy);
  vec3 n_ecdir = normalize(ec_dir.xyz);
  
  vec4 iec_dir = ec_dir * a_impos.y;
  vec2 n_ivwdir = normalize(iec_dir.xy);
  vec3 n_iecdir = normalize(iec_dir.xyz);

  float len = length(ec_dir.xyz);
  float vw_len = length(ec_dir.xy);
  //vec2 rf = ec_dir.xy/vw_len;

  float sinph = ec_dir.z / len;
  float rcosph = inversesqrt(1.0-sinph*sinph);
  float tanph = sinph * rcosph;
  float dec = a_radius * sinph;
  vec3 dec_dir = a_radius * tanph * n_ecdir;

  v_ndec = 2.0 * abs(dec) / vw_len;

  v_flag = sign( iec_dir.z );
  
  v_depmx = a_radius * rcosph;

  v_normadj = vec2(-sinph * a_impos.y, 1.0/rcosph);
  //v_vwdir = n_ivwdir;
  v_normmat = mat2(n_ivwdir.x, n_ivwdir.y,
                   -n_ivwdir.y, n_ivwdir.x);

  /////
  
  //v_ecpos = ec_tpos + vec4(vert_dsp, 0.0);
  //gl_Position = gl_ProjectionMatrix * v_ecpos;

  vec3 vert_dsp = vec3(-n_ivwdir.y,n_ivwdir.x,0);
  vert_dsp *= a_impos.x * (a_radius + u_edge);

  v_impos = a_impos;

  if ( dec > 0.0 ) {
    // extend the end of the cap
    vert_dsp -= dec_dir;
    //v_impos = a_impos + vec2(0, v_ndec * a_impos.y);
    
    v_impos.y *= 1.0 + v_ndec;
    //v_impos = a_impos;
  }
  v_impos.x *= 1.0 + u_edge/a_radius;

  vec4 ec_pos_dsp = ec_tpos + vec4(vert_dsp, 0.0);
  gl_Position = gl_ProjectionMatrix * ec_pos_dsp;

  v_color = a_color;
  v_ecpos = ec_pos_dsp;

  //gl_Position = vec4(0,0,0,0);
  //v_color = vec4(1,1,1,1);
  // gl_FrontColor = gl_Color;
}

