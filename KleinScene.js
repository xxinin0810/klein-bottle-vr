// KleinScene.js — Three.js Scene with Weave Realm Studio Brand Colors
import * as THREE from 'three';

export class KleinScene {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particles = null;
    this.lights = [];
    this.clock = new THREE.Clock();
  }

  init(container) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x053957);
    this.scene.fog = new THREE.FogExp2(0x053957, 0.06);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    );
    this.camera.position.set(0, 1.6, 2.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Lights
    this._setupLights();

    // Environment
    this._createEnvironment();

    // Resize handler
    window.addEventListener('resize', () => this._onResize());
  }

  _setupLights() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x125e8a, 0.4);
    this.scene.add(ambient);
    this.lights.push(ambient);

    // Key directional
    const key = new THREE.DirectionalLight(0x3c92ca, 1.2);
    key.position.set(3, 5, 3);
    this.scene.add(key);
    this.lights.push(key);

    // Fill light
    const fill = new THREE.DirectionalLight(0x204b57, 0.6);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);
    this.lights.push(fill);

    // Rim lights
    const rim1 = new THREE.PointLight(0x3c92ca, 1.5, 8);
    rim1.position.set(-2, 3, -1);
    this.scene.add(rim1);
    this.lights.push(rim1);

    const rim2 = new THREE.PointLight(0x08527c, 1.2, 8);
    rim2.position.set(2, 1, -2);
    this.scene.add(rim2);
    this.lights.push(rim2);
  }

  _createEnvironment() {
    // Grid floor
    const gridHelper = new THREE.GridHelper(12, 40, 0x3c92ca, 0x125e8a);
    gridHelper.position.y = -1.5;
    gridHelper.material.opacity = 0.25;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);

    // Axis helper
    const axesHelper = new THREE.AxesHelper(1);
    axesHelper.position.set(-4, -1.49, -4);
    this.scene.add(axesHelper);

    // Particle field
    const particleCount = 2000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const palette = [
      new THREE.Color(0x3c92ca),
      new THREE.Color(0x125e8a),
      new THREE.Color(0x204b57),
      new THREE.Color(0xc1dbe4),
    ];

    for (let i = 0; i < particleCount; i++) {
      const r = 3 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.025,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });

    this.particles = new THREE.Points(geom, mat);
    this.scene.add(this.particles);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(time) {
    // Animate particles
    if (this.particles) {
      this.particles.rotation.y = time * 0.03;
      this.particles.rotation.x = Math.sin(time * 0.02) * 0.1;
    }

    // Oscillate rim lights
    if (this.lights[3]) {
      this.lights[3].position.x = Math.sin(time * 0.5) * 2;
      this.lights[3].position.z = Math.cos(time * 0.5) * 2;
    }
    if (this.lights[4]) {
      this.lights[4].position.x = Math.cos(time * 0.4) * 2;
      this.lights[4].position.z = Math.sin(time * 0.4) * 2;
    }
  }

  getScene() { return this.scene; }
  getCamera() { return this.camera; }
  getRenderer() { return this.renderer; }
}
