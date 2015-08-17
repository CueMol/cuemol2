// -*-Mode: C++;-*-
//
//  vertex shader for cylinders
//

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
// Uniform variables

// Model-View projection matrix
// uniform mat4 mvp_matrix;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;

varying float v_ndec;

////////////////////
// Program

void main()
{
  vec2 rf, n_ecdir;
  vec3 vert_dsp, dec_dir;
  vec4 ec_tpos, ec_opos, ec_dir;
  float len, vw_len, dec;

  ec_tpos = gl_ModelViewMatrix * vec4(a_vertex, 1.0);
  ec_opos = gl_ModelViewMatrix * vec4((a_vertex+a_dir), 1.0);
  
  ec_dir = ec_opos - ec_tpos;
  n_ecdir.xy = normalize(ec_dir.xy);
  
  len = length(ec_dir.xyz);
  vw_len = length(ec_dir.xy);
  rf = ec_dir.xy/vw_len;

  dec = a_radius * ec_dir.z / len;
  v_ndec = 2.0 * dec / vw_len;

  dec_dir.xy = dec * rf;
  dec_dir.z = ec_dir.z * dec / len;

  /*if ( (dec*v_impos.t) > 0.0 ) {
    vert_dsp.x =  a_impos.x * n_ecdir.y * a_radius + dec_dir.x;
    vert_dsp.y = -a_impos.x * n_ecdir.x * a_radius + dec_dir.y;
    vert_dsp.z = dec_dir.z;
    v_impos = vec2(a_impos.s, a_impos.t + n_dec);
  }
  else {
    vert_dsp.x = a_impos.x * n_ecdir.y * a_radius;
    vert_dsp.y = -a_impos.x * n_ecdir.x * a_radius;
    vert_dsp.z = 0.0;
    v_impos = a_impos;
  //}
*/
  /////
  
  //v_ecpos = ec_tpos + vec4(vert_dsp, 0.0);
  //gl_Position = gl_ProjectionMatrix * v_ecpos;

  if ( dec > 0.0 ) {
    vert_dsp.x = a_impos.x * a_impos.y * -n_ecdir.y*a_radius - dec_dir.x;
    vert_dsp.y = a_impos.x * a_impos.y *  n_ecdir.x*a_radius - dec_dir.y;
    vert_dsp.z = - dec_dir.z;
    v_impos = a_impos;
  }
  else {
    vert_dsp.x = a_impos.x * a_impos.y * -n_ecdir.y*a_radius;
    vert_dsp.y = a_impos.x * a_impos.y *  n_ecdir.x*a_radius;
    vert_dsp.z = 0.0;
    v_impos = a_impos;
  }
  
  vec4 tmp = gl_ModelViewMatrix * vec4(a_vertex, 1.0) + vec4(vert_dsp, 0.0);
  gl_Position = gl_ProjectionMatrix * tmp;

  v_radius = a_radius;
  v_color = a_color;

  //gl_Position = vec4(0,0,0,0);
  //v_color = vec4(1,1,1,1);
  // gl_FrontColor = gl_Color;
}

