// -*-Mode: C++;-*-
//
//  mapvol_frag.glsl:
//    fragment shader for volume rendering
//

#version 120

uniform sampler1D xferFunTex;
uniform sampler3D dataFieldTex;
uniform float thickness;

// uniform float isolevel;

varying vec3 texcoor;

const float opacity = 0.9;

vec4 densityToColor( float d )
{
  vec4 color;
/*
  // vec3 col0 = vec3( d + 0.5, d * 2.0, d);
  // vec3 col0 = vec3( d*2.0, d * 2.0, d);
  vec3 col0 = vec3( 0.0, 1.0, 0.0);
  vec3 col1 = vec3( 0.0, 1.0, 1.0);
  if (d>isolevel)
    color = vec4( col1.rgb, d * opacity );
  else
    color = vec4( col0.rgb, d * 0.1 );
*/

  color =  texture1D(xferFunTex, d);
  //color = vec4(d + 0.5, d * 2.0, d, d*0.5);

  return color;
}


void main()
{
  float	d = texture3D(dataFieldTex, texcoor).x;
  vec4	c = densityToColor( d );
  c.a = c.a * thickness;

  gl_FragColor = c;

  // gl_FragColor = vec4( d, d, d, 0.1 );
  // gl_FragColor = vec4( gl_TexCoord[ 0 ].xyz, 0.1 );
  // gl_FragColor = vec4( t, 1.0 );
}

