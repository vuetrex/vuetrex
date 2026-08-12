varying vec4 vColor;
varying float lifeLeft;

void main() {
    vec2 centeredUv = gl_PointCoord - vec2(0.5);
    float radius = length(centeredUv);
    if (radius > 0.5) discard;

    float core = 1.0 - smoothstep(0.0, 0.16, radius);
    float glow = 1.0 - smoothstep(0.08, 0.3, radius);
    float fade = smoothstep(0.0, 0.12, lifeLeft) * min(1.0, lifeLeft * 6.0);
    float alpha = (core * 0.8 + glow * 0.34) * fade;
    vec3 color = vColor.rgb * (0.72 + core * 1.35);

    gl_FragColor = vec4(color, alpha);
}
