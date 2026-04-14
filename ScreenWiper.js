// ScreenWiper.js — 基于Google XRBlocks实现
import * as THREE from 'three';

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uMask;
uniform float uTime;
uniform vec4 uHoleColor;

void main() {
  // 从遮罩纹理读取"透明度"（涂抹的地方mask值高）
  vec4 maskData = texture2D(uMask, vUv);
  float mask = maskData.a;
  
  // 边缘脉冲效果
  float pulse = sin(uTime * 4.0) * 0.025;
  mask = clamp(mask + pulse * mask, 0.0, 1.0);
  
  // 反转逻辑：
  // mask=0 (未涂抹) → 显示蓝色遮罩（虚拟世界）
  // mask=1 (已涂抹) → 完全透明（真实世界）
  vec4 color = vec4(uHoleColor.rgb, (1.0 - mask) * uHoleColor.a);
  
  gl_FragColor = color;
}
`;

const CLEAR_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uWipePoint;
uniform float uWipeRadius;
uniform float uWipeActive;

void main() {
  vec4 maskData = texture2D(uMask, vUv);
  float mask = maskData.a;
  
  // 计算到擦拭点的距离
  float dist = distance(vUv, uWipePoint);
  
  // 擦拭效果：在半径内减少遮罩值（露出真实世界）
  float wipeAmount = smoothstep(uWipeRadius, uWipeRadius * 0.5, dist) * uWipeActive;
  mask = clamp(mask - wipeAmount * 0.15, 0.0, 1.0);
  
  // 自动恢复（向1增长，恢复为虚拟世界）
  mask = min(mask + 0.002, 1.0);
  
  gl_FragColor = vec4(0.0, 0.0, 0.0, mask);
}
`;

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
    
    // 主材质：显示遮罩效果
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: null },
        uMask: { value: renderTargetB.texture },
        uTime: { value: 0 },
        uHoleColor: { value: new THREE.Vector4(49/255, 103/255, 154/255, 0.9) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      side: THREE.DoubleSide,
    });
    
    // 大球体包裹相机
    const geometry = new THREE.SphereGeometry(50, 64, 64);
    geometry.scale(-1, 1, 1); // 反转法线，从内部看
    
    super(geometry, material);
    
    this.renderTargetA = renderTargetA;
    this.renderTargetB = renderTargetB;
    
    // 清除/累积着色器
    this.clearMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMask: { value: renderTargetA.texture },
        uWipePoint: { value: new THREE.Vector2(0.5, 0.5) },
        uWipeRadius: { value: 0.05 }, // 缩小3倍：从0.15改为0.05
        uWipeActive: { value: 0.0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: CLEAR_SHADER,
      transparent: true,
    });
    
    // 全屏四边形用于渲染到纹理
    this.fullscreenQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.clearMaterial
    );
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.orthoScene = new THREE.Scene();
    this.orthoScene.add(this.fullscreenQuad);
    
    // 控制器状态
    this.activeControllers = [];
    this.wipePositions = [new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0.5, 0.5)];
    this.wipeActive = [false, false];
    
    // 射线检测器
    this.raycaster = new THREE.Raycaster();
  }
  
  clear(renderer) {
    // 填充整个遮罩为不透明（mask=1 = 虚拟世界）
    renderer.setRenderTarget(this.renderTargetA);
    renderer.setClearColor(new THREE.Color(0, 0, 0), 1.0); // alpha=1
    renderer.clearColor();
    renderer.setRenderTarget(this.renderTargetB);
    renderer.setClearColor(new THREE.Color(0, 0, 0), 1.0); // alpha=1
    renderer.clearColor();
    renderer.setRenderTarget(null);
    
    this.material.uniforms.uMask.value = this.renderTargetB.texture;
  }
  
  update(renderer, time) {
    // 跟随相机位置
    const xrCamera = renderer.xr.getCamera();
    if (xrCamera && xrCamera.cameras && xrCamera.cameras[0]) {
      this.position.copy(xrCamera.cameras[0].position);
    }
    
    // 处理控制器输入
    for (let i = 0; i < 2; i++) {
      if (this.activeControllers[i]) {
        const controller = this.activeControllers[i];
        
        // 射线检测
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyQuaternion(controller.quaternion);
        
        const intersects = this.raycaster.intersectObject(this);
        
        if (intersects.length > 0) {
          const uv = intersects[0].uv;
          this.wipePositions[i].set(uv.x, uv.y);
          this.wipeActive[i] = true;
        }
      } else {
        this.wipeActive[i] = false;
      }
    }
    
    // 更新时间
    this.material.uniforms.uTime.value = time;
    
    // 双缓冲渲染：累积遮罩
    const xrEnabled = renderer.xr.enabled;
    const xrTarget = renderer.getRenderTarget();
    
    renderer.xr.enabled = false;
    
    // 交换缓冲区
    [this.renderTargetA, this.renderTargetB] = [this.renderTargetB, this.renderTargetA];
    
    // 更新擦拭参数
    this.clearMaterial.uniforms.uMask.value = this.renderTargetA.texture;
    
    // 使用第一个活跃的控制器
    const activeIdx = this.wipeActive[0] ? 0 : (this.wipeActive[1] ? 1 : -1);
    if (activeIdx >= 0) {
      this.clearMaterial.uniforms.uWipePoint.value.copy(this.wipePositions[activeIdx]);
      this.clearMaterial.uniforms.uWipeActive.value = 1.0;
    } else {
      this.clearMaterial.uniforms.uWipeActive.value = 0.0;
    }
    
    // 渲染到B
    renderer.setRenderTarget(this.renderTargetB);
    renderer.render(this.orthoScene, this.orthoCamera);
    
    // 更新主材质的遮罩纹理
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
    this.clearMaterial.dispose();
  }
}
