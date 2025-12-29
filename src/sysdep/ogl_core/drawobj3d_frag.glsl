// -*-Mode: C++;-*-
//
//  Triangle fragment shader for OpenGL
//

////////////////////
// Varying variables

in vec4 v_frontColor;

out vec4 o_FragColor;

void main(void)
{
    o_FragColor = v_frontColor;
}
