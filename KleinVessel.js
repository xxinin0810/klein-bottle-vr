// KleinVessel.js — Core Klein Bottle Component with WebXR + Ping-Pong FBO
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { KleinVertexShader, KleinFragmentShader } from './KleinShader.js';

export class KleinVessel {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.kleinMesh = null;
    this.controllers = [];
    this.controllerGrips = [];

    // Wipe state
    this.wipeCenter = new THREE.Vector2(0.5, 0.5);
    this.wipeRadius = 0.18;
    this.isWiping = false;
    this.wipeStrength = 1.0;

    // Ping-pong FBO
    this.rtRead = null;
    this.rtWrite = null;
    this.currentRT = 0; // 0=read, 1=write

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();

    // VR state
    this.xrSession = null;
    this.referenceSpace = null;
    this.isVRMode = false;

    this._init();
  }

  _init() {
    this._initRenderTargets();
    this._createKleinBottle();
    this._setupXRControllers();
  }

  _initRenderTargets() {
    const size = 1024;
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.rtRead  = new THREE.WebGLRenderTarget(size, size, opts);
    this.rtWrite = new THREE.WebGLRenderTarget(size, size, opts);

    // Pre-fill both with transparent
    const clearColor = new THREE.Color(0x000000);
    this.renderer.setRenderTarget(this.rtRead);
    this.renderer.clearColor();
    this.renderer.setRenderTarget(this.rtWrite);
    this.renderer.clearColor();
    this.renderer.setRenderTarget(null);
  }

  _createKleinBottle() {
    // High-subdivision sphere inverted for back-face rendering
    const geom = new THREE.SphereGeometry(1.2, 128, 128);
    geom.scale(-1, 1, 1); // Flip normals for inside-out view

    this.kleinMaterial = new THREE.ShaderMaterial({
      vertexShader:   KleinVertexShader,
      fragmentShader: KleinFragmentShader,
      side: THREE.BackSide,
      transparent: true,
      uniforms: {
        uTime:          { value: 0 },
        uWipeCenter:    { value: new THREE.Vector2(0.5, 0.5) },
        uWipeRadius:    { value: this.wipeRadius },
        uWipeStrength:  { value: 0.0 },
        uTrailTexture:  { value: null },
        uResolution:    { value: new THREE.Vector2(1024, 1024) },
      },
    });

    this.kleinMesh = new THREE.Mesh(geom, this.kleinMaterial);
    this.kleinMesh.position.set(0, 1.2, -0.5);
    this.scene.add(this.kleinMesh);
  }

  _setupXRControllers() {
    const controllerModelFactory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      // Controller
      const ctrl = this.renderer.xr.getController(i);
      ctrl.addEventListener('selectstart', (e) => this._onSelectStart(e, i));
      ctrl.addEventListener('selectend',   (e) => this._onSelectEnd(e, i));
      this.scene.add(ctrl);
      this.controllers.push(ctrl);

      // Controller visual — ray line
      const rayGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -3),
      ]);
      const rayMat = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x3c92ca : 0x125e8a,
        transparent: true,
        opacity: 0.7,
      });
      const ray = new THREE.Line(rayGeom, rayMat);
      ctrl.add(ray);

      // Grip (hand)
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(controllerModelFactory.createControllerModel(grip));
      this.scene.add(grip);
      this.controllerGrips.push(grip);
    }
  }

  _onSelectStart(event, index) {
    this.isWiping = true;
    this._updateWipePosition(event);
  }

  _onSelectEnd(event, index) {
    this.isWiping = false;
    // Commit wipe to trail
    if (this._hasMoved()) {
      this._updateTrailTexture();
    }
  }

  _updateWipePosition(event) {
    if (!event) return;

    const controller = event.target;
    if (!controller) return;

    // Cast ray against invisible UV-detection plane
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    // Intersect with Klein bottle mesh
    const hits = this.raycaster.intersectObject(this.kleinMesh);
    if (hits.length > 0) {
      const uv = hits[0].uv;
      this.wipeCenter.set(uv.x, 1.0 - uv.y);
    }
  }

  _hasMoved() {
    // Simple distance check — treat any wipe as movement
    return this.isWiping;
  }

  _updateTrailTexture() {
    // Ping-pong swap
    const readRT  = this.currentRT === 0 ? this.rtRead : this.rtWrite;
    const writeRT = this.currentRT === 0 ? this.rtWrite : this.rtRead;

    // Composite: previous trail + current wipe circle
    this.renderer.setRenderTarget(writeRT);
    this.renderer.clearColor();

    // TODO: draw current wipe circle as an additive white blob
    // For now, simply carry forward existing alpha
    const copyShader = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: readRT.texture } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyShader);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.renderer.render(quad, ortho);

    this.currentRT = this.currentRT === 0 ? 1 : 0;
    this.renderer.setRenderTarget(null);
  }

  setWipeFromMouse(ndcX, ndcY) {
    this.wipeCenter.set((ndcX + 1) * 0.5, (ndcY + 1) * 0.5);
  }

  processXRInput(session) {
    if (!session) return;

    const sources = session.inputSources;
    for (const source of sources) {
      if (!source.gamepad) continue;

      const gp = source.gamepad;
      const idx = source.handedness === 'right' ? 0 : 1;
      const ctrl = this.controllers[idx];

      if (!ctrl) continue;

      // Trigger button (index 0) for wipe
      if (gp.buttons[0] && gp.buttons[0].pressed) {
        this.isWiping = true;
        this._updateWipePosition({ target: ctrl });
      } else if (this.isWiping) {
        this.isWiping = false;
        this._updateTrailTexture();
      }
    }
  }

  update(time, delta) {
    // Update shader uniforms
    this.kleinMaterial.uniforms.uTime.value = time;
    this.kleinMaterial.uniforms.uWipeCenter.set(
      this.wipeCenter.x,
      this.wipeCenter.y
    );
    this.kleinMaterial.uniforms.uWipeRadius.value = this.wipeRadius;
    this.kleinMaterial.uniforms.uWipeStrength.value = this.isWiping ? 1.0 : 0.0;
    this.kleinMaterial.uniforms.uTrailTexture.value =
      this.currentRT === 0 ? this.rtRead.texture : this.rtWrite.texture;

    // Subtle rotation
    this.kleinMesh.rotation.y = time * 0.1;
    this.kleinMesh.rotation.x = Math.sin(time * 0.2) * 0.1;
  }

  reset() {
    // Clear both FBO
    this.renderer.setRenderTarget(this.rtRead);
    this.renderer.clearColor();
    this.renderer.setRenderTarget(this.rtWrite);
    this.renderer.clearColor();
    this.renderer.setRenderTarget(null);
    this.currentRT = 0;
  }

  getSessionInitOptions() {
    return {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'layers'],
    };
  }
}
