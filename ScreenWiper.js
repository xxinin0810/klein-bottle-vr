// ScreenWiper.js — 完全按照Google XRBlocks实现
import * as THREE from 'three';

const DEG_TO_RAD = Math.PI / 180.0;

const ALPHA_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uWiperDegrees: { value: 10.0 },
    uLeftWiperActive: { value: false },
    uLeftHandCartesianCoordinate: { value: new THREE.Vector3(0.0, -1.0, 0.0) },
    uRightWiperActive: { value: false },
    uRightHandCartesianCoordinate: { value: new THREE.Vector3(0.0, -1.0, 0.0) },
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
    #define DEG_TO_RAD 3.14159265359 / 180.0
    
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uWiperDegrees;
    uniform bool uLeftWiperActive;
    uniform vec3 uLeftHandCartesianCoordinate;
    uniform bool uRightWiperActive;
    uniform vec3 uRightHandCartesianCoordinate;
    uniform float uReturnSpeed;

    vec3 sphericalToCartesian(vec3 spherical) {
      float x = spherical.x * cos(spherical.y) * sin(spherical.z);
      float y = spherical.x * cos(spherical.z);
      float z = spherical.x * sin(spherical.y) * sin(spherical.z);
      return vec3(x, y, z);
    }

    float getWiperValue(bool wiperActive, vec3 handCartesianCoordinate) {
      if (!wiperActive) return 1.0;
      
      // UV坐标转球面坐标：镜像X轴修正左右反转
      vec3 cartesianCoordinate = sphericalToCartesian(vec3(1.0, (1.0 - vUv.x) * 2.0 * PI, vUv.y * PI));
      float cosineSimilarity = dot(handCartesianCoordinate, cartesianCoordinate);
      float wiperValue = 1.0 - smoothstep(cos(uWiperDegrees * DEG_TO_RAD), 1.0, cosineSimilarity);
      wiperValue = 0.95 + 0.05 * wiperValue;
      return wiperValue;
    }

    void main() {
      float prevFrameValue = texture2D(tDiffuse, vUv).g;
      
      // 只在不活动时才恢复，且只在值小于1时恢复
      float newFrameValue = prevFrameValue;
      if (!uLeftWiperActive && !uRightWiperActive && prevFrameValue < 1.0) {
        newFrameValue = prevFrameValue + uReturnSpeed;
      }
      
      // 擦拭时减少值
      newFrameValue *= getWiperValue(uLeftWiperActive, uLeftHandCartesianCoordinate);
      newFrameValue *= getWiperValue(uRightWiperActive, uRightHandCartesianCoordinate);
      
      // 限制在0-1范围
      newFrameValue = clamp(newFrameValue, 0.0, 1.0);
      
      gl_FragColor = vec4(vec3(newFrameValue), 1.0);
    }
  `,
};

const SCREEN_WIPER_SHADER = {
  uniforms: {
    uMask: { value: null },
    uHoleColor: { value: new THREE.Vector4(49/255, 103/255, 154/255, 0.9) },
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
    uniform vec4 uHoleColor;
    uniform float uTime;

    void main() {
      float mask = texture2D(uMask, vUv).g; // 从绿色通道读取
      
      // 脉冲效果
      float pulse = sin(uTime * 4.0) * 0.025;
      mask = clamp(mask + pulse * mask, 0.0, 1.0);
      
      // mask值高 = 显示虚拟世界（蓝色）
      // mask值低 = 显示真实世界（透明）
      vec4 color = vec4(uHoleColor.rgb, mask * uHoleColor.a);
      
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
      
      // 直接使用控制器的世界方向
      const controllerPos = new THREE.Vector3();
      const controllerDir = new THREE.Vector3(0, 0, -1);
      
      controllerPos.setFromMatrixPosition(controller.matrixWorld);
      controllerDir.applyQuaternion(controller.quaternion);
      
      this.raycaster.ray.origin.copy(controllerPos);
      this.raycaster.ray.direction.copy(controllerDir);
      
      const intersects = this.raycaster.intersectObject(this);
      
      if (intersects.length > 0) {
        const point = intersects[0].point.clone();
        const worldPos = new THREE.Vector3();
        this.getWorldPosition(worldPos);
        
        // 方向：从球心指向交点
        const dir = point.sub(worldPos).normalize();
        
        if (isLeft) {
          this.alphaMaterial.uniforms.uLeftWiperActive.value = true;
          this.alphaMaterial.uniforms.uLeftHandCartesianCoordinate.value.copy(dir);
        } else {
          this.alphaMaterial.uniforms.uRightWiperActive.value = true;
          this.alphaMaterial.uniforms.uRightHandCartesianCoordinate.value.copy(dir);
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
