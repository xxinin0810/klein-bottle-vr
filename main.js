// main.js — Klein Bottle VR Application
import * as THREE from 'three';
import { ScreenWiper } from './ScreenWiper.js';

class KleinApp {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.screenWiper = null;
    this.clock = new THREE.Clock();
    this.controllers = [];
  }

  async init() {
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x053957);
    
    // 创建相机
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.6, 0);
    
    // 创建渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // 启用透明背景
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.setClearColor(0x000000, 0); // 完全透明背景
    document.body.appendChild(this.renderer.domElement);
    
    // 创建 ScreenWiper
    this.screenWiper = new ScreenWiper();
    this.scene.add(this.screenWiper);
    
    // 初始化遮罩
    this.screenWiper.clear(this.renderer);
    
    // 设置灯光
    const ambientLight = new THREE.AmbientLight(0x3c92ca, 0.5);
    this.scene.add(ambientLight);
    
    // 设置VR控制器
    this._setupControllers();
    
    // 绑定事件
    this._bindEvents();
    
    // 检查WebXR支持
    if ('xr' in navigator) {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
      const btn = document.getElementById('vr-button');
      if (supported) {
        btn.disabled = false;
        btn.textContent = 'ENTER VR';
      } else {
        btn.textContent = 'VR NOT SUPPORTED';
      }
    }
    
    // 隐藏加载界面
    document.getElementById('loading-screen').classList.add('hidden');
    
    // 开始动画循环
    this._animate();
  }
  
  _setupControllers() {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('selectstart', (e) => {
        this.screenWiper.addActiveController(e.target);
      });
      controller.addEventListener('selectend', (e) => {
        this.screenWiper.removeActiveController(e.target);
      });
      this.scene.add(controller);
      this.controllers.push(controller);
      
      // 添加射线可视化
      const rayGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -5),
      ]);
      const rayMat = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x3c92ca : 0x125e8a,
        transparent: true,
        opacity: 0.6,
      });
      const ray = new THREE.Line(rayGeom, rayMat);
      controller.add(ray);
    }
  }
  
  _bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // VR按钮
    const btn = document.getElementById('vr-button');
    btn.addEventListener('click', () => {
      if (this.renderer.xr.isPresenting) {
        this.renderer.xr.getSession().end();
      } else {
        this._startVRSession();
      }
    });
    
    // 键盘快捷键
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this._startVRSession();
      if (e.code === 'KeyR') this.screenWiper.clear(this.renderer);
    });
    
    // 桌面鼠标调试
    const canvas = this.renderer.domElement;
    let mouseDown = false;
    
    canvas.addEventListener('mousedown', () => {
      mouseDown = true;
      this.screenWiper.wipeActive[0] = true;
    });
    
    canvas.addEventListener('mouseup', () => {
      mouseDown = false;
      this.screenWiper.wipeActive[0] = false;
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (mouseDown) {
        const x = e.clientX / window.innerWidth;
        const y = 1.0 - e.clientY / window.innerHeight;
        this.screenWiper.wipePositions[0].set(x, y);
      }
    });
  }
  
  async _startVRSession() {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['passthrough'], // 请求透视功能
      });
      
      // 检查是否支持透视
      if (session.enabledFeatures && session.enabledFeatures.includes('passthrough')) {
        console.log('Passthrough enabled');
        this.scene.background = null; // 清除背景色，使用透明
      } else {
        console.log('Passthrough not available, using transparent background');
        this.scene.background = null;
      }
      
      session.addEventListener('end', () => {
        document.getElementById('vr-button').textContent = 'ENTER VR';
        this.scene.background = new THREE.Color(0x053957);
      });
      
      await this.renderer.xr.setSession(session);
      document.getElementById('vr-button').textContent = 'EXIT VR';
      
    } catch (err) {
      console.error('VR启动失败:', err);
      alert('VR启动失败: ' + err.message);
    }
  }
  
  _animate() {
    this.renderer.setAnimationLoop((time) => {
      const elapsed = this.clock.getElapsedTime();
      
      // 更新 ScreenWiper
      this.screenWiper.update(this.renderer, elapsed);
      
      // 渲染场景
      this.renderer.render(this.scene, this.camera);
    });
  }
}

// 启动应用
window.addEventListener('DOMContentLoaded', async () => {
  const app = new KleinApp();
  await app.init();
});
