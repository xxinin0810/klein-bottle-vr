// ScreenWiper.js — 完全按照Google XRBlocks实现
import * as THREE from 'three';

const DEG_TO_RAD = Math.PI / 180.0;

const ALPHA_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uWiperRadius: { value: 0.03 },
    uLeftWiperActive: { value: false },
    uLeftWipeUv: { value: new THREE.Vector2(0.5, 0.5) },
    uRightWiperActive: { value: false },
    uRightWipeUv: { value: new THREE.Vector2(0.5, 0.5) },
    uReturnSpeed: { value: 0.005 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #define PI 3.14159265359
    
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uWiperRadius;
    uniform bool uLeftWiperActive;
    uniform vec2 uLeftWipeUv;
    uniform bool uRightWiperActive;
    uniform vec2 uRightWipeUv;
    uniform float uReturnSpeed;

    float getWiperValue(bool wiperActive, vec2 wipeUv) {
      if (!wiperActive) return 1.0;
      
      // 使用UV坐标距离计算擦拭区域
      vec2 diff = vUv - wipeUv;
      
      // 水平方向环绕处理（0和1是相连的）
      if (diff.x > 0.5) diff.x -= 1.0;
      if (diff.x < -0.5) diff.x += 1.0;
      
      float dist = length(diff);
      
      // 在半径范围内减少值，范围外返回1.0（不变）
      if (dist < uWiperRadius * 2.0) {
        // 中心=0.02(几乎透明)，边缘=1.0(不透明)
        return mix(0.02, 1.0, smoothstep(0.0, uWiperRadius, dist));
      }
      return 1.0; // 范围外保持不变
    }

    void main() {
      float prevFrameValue = texture2D(tDiffuse, vUv).g;
      
      float newFrameValue = prevFrameValue;
      bool anyWiperActive = uLeftWiperActive || uRightWiperActive;
      
      // 不活动时逐渐恢复
      if (!anyWiperActive && prevFrameValue < 0.999) {
        newFrameValue = min(prevFrameValue + uReturnSpeed, 1.0);
      }
      
      // 活动时：只在擦拭区域减少值
      if (anyWiperActive) {
        float leftWipe = getWiperValue(uLeftWiperActive, uLeftWipeUv);
        float rightWipe = getWiperValue(uRightWiperActive, uRightWipeUv);
        
        // 取两个擦拭器的最小值（最透明）
        float wipeFactor = min(leftWipe, rightWipe);
        
        // 只减少不增加：取当前值和擦拭值的较小者
        newFrameValue = min(prevFrameValue, wipeFactor);
      }
      
      newFrameValue = clamp(newFrameValue, 0.0, 1.0);
      
      gl_FragColor = vec4(vec3(newFrameValue), 1.0);
    }
  `,
};

const SCREEN_WIPER_SHADER = {
  uniforms: {
    uMask: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D uMask;
    uniform float uTime;
    
    // 噪声函数
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    
    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    
    float fbm(vec2 st) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 6; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }
    
    // 莫奈油画风格背景
    vec3 monetBackground(vec2 uv, float time) {
      // 基础色调 - 莫奈《塞纳河上的浮冰》配色
      vec3 sky1 = vec3(0.75, 0.82, 0.88); // 浅蓝天空
      vec3 sky2 = vec3(0.65, 0.75, 0.85); // 深蓝天空
      vec3 water = vec3(0.55, 0.68, 0.78); // 河水蓝
      vec3 ice = vec3(0.92, 0.95, 0.97); // 冰块白
      vec3 warm = vec3(0.95, 0.88, 0.75); // 暖色光
      vec3 shadow = vec3(0.45, 0.55, 0.65); // 阴影蓝
      
      // 噪声纹理
      float n1 = fbm(uv * 3.0 + time * 0.02);
      float n2 = fbm(uv * 5.0 - time * 0.015);
      float n3 = fbm(uv * 8.0 + vec2(time * 0.01, -time * 0.01));
      
      // 天空和水的渐变
      float horizon = 0.45 + n1 * 0.1;
      vec3 color = mix(sky2, sky1, uv.y + n2 * 0.2);
      color = mix(color, water, smoothstep(horizon - 0.05, horizon + 0.05, uv.y));
      
      // 冰块效果
      float iceNoise = fbm(uv * 10.0 + time * 0.01);
      float iceMask = smoothstep(0.3, 0.7, iceNoise) * smoothstep(horizon - 0.1, horizon + 0.15, uv.y);
      color = mix(color, ice, iceMask * 0.6);
      
      // 笔触效果
      float brushStrokes = sin(uv.x * 80.0 + n2 * 10.0) * sin(uv.y * 80.0 + n3 * 10.0);
      brushStrokes = brushStrokes * 0.5 + 0.5;
      
      // 光影效果
      float light = n1 * 0.3 + 0.7;
      color *= light;
      
      // 添加暖色光斑
      float warmSpots = smoothstep(0.6, 0.8, n3);
      color = mix(color, warm, warmSpots * 0.3);
      
      // 添加阴影层次
      float shadowMask = smoothstep(0.4, 0.6, n2);
      color = mix(color, shadow, shadowMask * 0.2);
      
      // 轻微的色彩波动
      color.r += sin(time * 0.5 + uv.x * 10.0) * 0.02;
      color.g += cos(time * 0.4 + uv.y * 8.0) * 0.02;
      color.b += sin(time * 0.6 + uv.x * 12.0) * 0.02;
      
      return color;
    }

    void main() {
      float mask = texture2D(uMask, vUv).g; // 从绿色通道读取
      
      // 脉冲效果
      float pulse = sin(uTime * 4.0) * 0.01;
      mask = clamp(mask + pulse, 0.0, 1.0);
      
      // 生成莫奈油画背景
      vec3 monetColor = monetBackground(vUv, uTime);
      
      // mask值高(≈1) = 显示虚拟世界（莫奈油画，完全不透明）
      // mask值低(≈0) = 显示真实世界（完全透明）
      vec4 color = vec4(monetColor, mask);
      
      gl_FragColor = color;
    }
  `,
};

export class ScreenWiper extends THREE.Mesh {
  constructor() {
    const RESOLUTION = 1024;
    
    // 双缓冲渲染目标
    const renderTargetA = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    
    const renderTargetB = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    
    // 主材质
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SCREEN_WIPER_SHADER.uniforms),
      vertexShader: SCREEN_WIPER_SHADER.vertexShader,
      fragmentShader: SCREEN_WIPER_SHADER.fragmentShader,
      transparent: true,
      depthWrite: false, // 关键：允许透明区域显示底层内容
      side: THREE.DoubleSide,
    });
    
    // 大球体
    const geometry = new THREE.SphereGeometry(50, 64, 64);
    geometry.scale(-1, 1, 1);
    
    super(geometry, material);
    
    this.renderTargetA = renderTargetA;
    this.renderTargetB = renderTargetB;
    
    // Alpha累积材质
    this.alphaMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(ALPHA_SHADER.uniforms),
      vertexShader: ALPHA_SHADER.vertexShader,
      fragmentShader: ALPHA_SHADER.fragmentShader,
    });
    
    // 全屏四边形
    this.fullscreenQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.alphaMaterial
    );
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.orthoScene = new THREE.Scene();
    this.orthoScene.add(this.fullscreenQuad);
    
    // 控制器状态
    this.activeControllers = [];
    
    // 射线检测器
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
  }
  
  clear(renderer) {
    // 填充初始值为1（完全不透明的虚拟世界）
    // 绿色通道=1 = 显示虚拟世界
    renderer.setRenderTarget(this.renderTargetA);
    renderer.setClearColor(new THREE.Color(1, 1, 1), 1.0); // RGB都是1
    renderer.clearColor();
    renderer.setRenderTarget(this.renderTargetB);
    renderer.setClearColor(new THREE.Color(1, 1, 1), 1.0); // RGB都是1
    renderer.clearColor();
    renderer.setRenderTarget(null);
    
    this.material.uniforms.uMask.value = this.renderTargetB.texture;
  }
  
  update(renderer, time) {
    // 跟随相机
    const xrCamera = renderer.xr.getCamera();
    if (xrCamera && xrCamera.cameras && xrCamera.cameras[0]) {
      this.position.copy(xrCamera.cameras[0].position);
    }
    
    // 处理控制器
    this.alphaMaterial.uniforms.uLeftWiperActive.value = false;
    this.alphaMaterial.uniforms.uRightWiperActive.value = false;
    
    for (let i = 0; i < this.activeControllers.length && i < 2; i++) {
      const controller = this.activeControllers[i];
      const isLeft = i === 0;
      
      // 使用控制器方向进行射线检测
      const controllerPos = new THREE.Vector3();
      const controllerDir = new THREE.Vector3(0, 0, -1);
      
      controllerPos.setFromMatrixPosition(controller.matrixWorld);
      controllerDir.applyQuaternion(controller.quaternion);
      
      this.raycaster.ray.origin.copy(controllerPos);
      this.raycaster.ray.direction.copy(controllerDir);
      
      const intersects = this.raycaster.intersectObject(this);
      
      if (intersects.length > 0) {
        // 直接使用射线交点返回的UV坐标
        const uv = intersects[0].uv;
        
        if (uv) {
          if (isLeft) {
            this.alphaMaterial.uniforms.uLeftWiperActive.value = true;
            this.alphaMaterial.uniforms.uLeftWipeUv.value.set(uv.x, uv.y);
          } else {
            this.alphaMaterial.uniforms.uRightWiperActive.value = true;
            this.alphaMaterial.uniforms.uRightWipeUv.value.set(uv.x, uv.y);
          }
        }
      }
    }
    
    // 更新时间
    this.material.uniforms.uTime.value = time;
    
    // 双缓冲渲染
    const xrEnabled = renderer.xr.enabled;
    const xrTarget = renderer.getRenderTarget();
    
    renderer.xr.enabled = false;
    
    // 交换缓冲区
    [this.renderTargetA, this.renderTargetB] = [this.renderTargetB, this.renderTargetA];
    
    // 渲染累积
    this.alphaMaterial.uniforms.tDiffuse.value = this.renderTargetA.texture;
    renderer.setRenderTarget(this.renderTargetB);
    renderer.render(this.orthoScene, this.orthoCamera);
    
    // 更新主材质
    this.material.uniforms.uMask.value = this.renderTargetB.texture;
    
    renderer.xr.enabled = xrEnabled;
    renderer.setRenderTarget(xrTarget);
  }
  
  addActiveController(controller) {
    const index = this.activeControllers.indexOf(controller);
    if (index === -1) {
      this.activeControllers.push(controller);
    }
  }
  
  removeActiveController(controller) {
    const index = this.activeControllers.indexOf(controller);
    if (index !== -1) {
      this.activeControllers.splice(index, 1);
    }
  }
  
  dispose() {
    this.renderTargetA.dispose();
    this.renderTargetB.dispose();
    this.material.dispose();
    this.alphaMaterial.dispose();
  }
}
