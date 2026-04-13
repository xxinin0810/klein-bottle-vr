// KleinShader.js — Klein Bottle GLSL Shaders with Weave Realm Studio Colors
// 图8浸入形式 + Möbius边缘 + 流场噪声 + 织境品牌色

export const KleinVertexShader = /* glsl */`
  precision highp float;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying float vEdgeFactor;

  uniform float uTime;

  // Klein bottle "figure-8" immersion
  vec3 kleinBottle(float u, float v, float t) {
    float r = 2.0;
    float a = 1.0;
    float u2 = u * 6.28318 + t;
    float v2 = v * 6.28318;

    float x = (a + cos(u2 / 2.0) * cos(v2) - sin(u2 / 2.0) * sin(2.0 * v2)) * cos(v2);
    float y = (a + cos(u2 / 2.0) * cos(v2) - sin(u2 / 2.0) * sin(2.0 * v2)) * sin(v2);
    float z = sin(u2 / 2.0) * cos(v2) + cos(u2 / 2.0) * sin(2.0 * v2);

    return vec3(x, y, z) * r * 0.7;
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    // Subtle time warp on vertices for breathing effect
    float t = uTime * 0.3;
    vec3 pos = position;
    float warp = sin(pos.x * 2.0 + t) * cos(pos.y * 2.0 + t) * 0.05;
    pos += normal * warp;

    vPosition = pos;
    vEdgeFactor = 1.0 - abs(dot(normal, vec3(0.0, 0.0, 1.0)));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const KleinFragmentShader = /* glsl */`
  precision highp float;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying float vEdgeFactor;

  uniform float uTime;
  uniform vec2 uWipeCenter;
  uniform float uWipeRadius;
  uniform float uWipeStrength;
  uniform sampler2D uTrailTexture;
  uniform vec2 uResolution;

  // Weave Realm Studio brand colors
  const vec3 WEAVE_PRIMARY    = vec3(0.071, 0.369, 0.541); // #125e8a
  const vec3 WEAVE_ACCENT     = vec3(0.235, 0.573, 0.792); // #3c92ca
  const vec3 WEAVE_DEEP_GREEN = vec3(0.125, 0.294, 0.341); // #204b57
  const vec3 WEAVE_ABYSS_BLUE = vec3(0.020, 0.224, 0.341); // #053957
  const vec3 WEAVE_MID_BLUE   = vec3(0.031, 0.322, 0.486); // #08527c
  const vec3 WEAVE_SILVER     = vec3(0.757, 0.855, 0.894); // #c1dbe4

  // ── Simplex 3D noise (Stefan Gustavson) ──────────────────────────────────────
  vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289v3(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  // ── Flow field noise ─────────────────────────────────────────────────────────
  float flowNoise(vec3 p, float t) {
    float f = 0.0;
    f += 0.5000 * snoise(p + vec3(0.0, t * 0.2, 0.0));
    f += 0.2500 * snoise(p * 2.0 + vec3(t * 0.15, 0.0, t * 0.1));
    f += 0.1250 * snoise(p * 4.0 - vec3(0.0, t * 0.1, t * 0.2));
    f += 0.0625 * snoise(p * 8.0 + vec3(t * 0.08));
    return f * 0.5 + 0.5;
  }

  // ── Möbius edge effect ───────────────────────────────────────────────────────
  float mobiusEdge(vec2 uv, float t) {
    float angle = atan(uv.y, uv.x);
    float halfTwist = mod(angle * 2.0 + t, 6.28318);
    float edge = sin(halfTwist * 3.0 + t * 0.5);
    return smoothstep(0.6, 0.9, edge) * 0.35;
  }

  // ── Weave color map: virtual world vs reality ────────────────────────────────
  vec3 weaveColorMap(float t, float depth) {
    float smoothT = smoothstep(0.0, 1.0, t);
    vec3 colorA = mix(WEAVE_ACCENT, WEAVE_PRIMARY, smoothT);    // 虚拟世界：亮青蓝 → 主品牌蓝
    vec3 colorB = mix(WEAVE_DEEP_GREEN, WEAVE_ABYSS_BLUE, smoothT); // 现实世界：深海绿 → 渊藍蓝
    return mix(colorA, colorB, depth);
  }

  void main() {
    vec2 uv = vUv;

    // Flow field noise
    float t = uTime * 0.15;
    vec3 flowPos = vec3(uv * 4.0, t);
    float flow = flowNoise(flowPos, t);
    float flow2 = flowNoise(flowPos * 1.5 + vec3(5.2, 3.1, 2.7), t * 0.8);
    float composite = flow * 0.6 + flow2 * 0.4;

    // Erase mask: only current wipe, no trail accumulation
    vec2 diff = uv - uWipeCenter;
    diff.x *= uResolution.x / uResolution.y;
    float dist = length(diff);
    float currentMask = 1.0 - smoothstep(uWipeRadius * 0.3, uWipeRadius, dist);
    currentMask *= uWipeStrength;

    float totalMask = currentMask;

    // Möbius edge shimmer
    vec2 centeredUv = uv * 2.0 - 1.0;
    float edgeEffect = mobiusEdge(centeredUv, uTime * 0.4);
    edgeEffect *= (1.0 - totalMask);

    // Depth for color interpolation
    float depth = composite * 0.4 + vEdgeFactor * 0.3 + edgeEffect;
    depth = clamp(depth, 0.0, 1.0);

    vec3 col = weaveColorMap(composite, depth);

    // Fresnel highlight
    float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    col += fresnel * WEAVE_ACCENT * 0.6;

    // Pulse ring at wipe center
    float pulse = sin(uTime * 3.0 - dist * 30.0) * 0.5 + 0.5;
    float ring = smoothstep(0.02, 0.0, abs(dist - uWipeRadius * 0.6)) * pulse;
    col += ring * WEAVE_SILVER * 0.4;

    // Grid lines on surface
    vec2 grid = abs(fract(uv * 20.0) - 0.5);
    float gridLine = smoothstep(0.47, 0.5, max(grid.x, grid.y));
    col = mix(col, WEAVE_SILVER * 0.15, gridLine * (1.0 - totalMask) * 0.5);

    // Trail glow - only show on edges, not in center
    col = mix(col, WEAVE_ACCENT * 0.3, trailMask * 0.4);

    // Wipe reveals transparent background (passthrough)
    // 边缘发光效果
    float edgeGlow = smoothstep(uWipeRadius, uWipeRadius * 0.6, dist) - smoothstep(uWipeRadius * 0.6, uWipeRadius * 0.3, dist);
    col += edgeGlow * WEAVE_ACCENT * 0.5 * uWipeStrength;

    // Alpha: fully transparent in wipe area for passthrough
    float alpha = 1.0 - currentMask * 0.98;

    gl_FragColor = vec4(col, alpha);
  }
`;
