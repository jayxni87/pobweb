#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec4 v_color;

uniform sampler2D u_atlas;

out vec4 fragColor;

void main() {
  vec4 texColor = texture(u_atlas, v_texCoord);
  fragColor = texColor * v_color;
  if (fragColor.a < 0.01) discard;
}
