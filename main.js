// main.js — Klein Bottle VR Application
import * as THREE from 'three';
import { KleinScene } from './KleinScene.js';
import { KleinVessel } from './KleinVessel.js';

class KleinApp {
  constructor() {
    this.sceneManager = null;
    this.vessel = null;
    this.clock = new THREE.Clock();

    this.isVRRunning = false;
    this.loaded = false;

    // Mouse/touch debug state
    this.mouseNDC = new THREE.Vector2();
    this.mouseDown = false;
  }

  async init() {
    const container = document.getElementById('container') || document.body;

    // Scene
    this.sceneManager = new KleinScene();
    this.sceneManager.init(container);

    // Klein Vessel
    this.vessel = new KleinVessel(
      this.sceneManager.getScene(),
      this.sceneManager.getRenderer()
    );

    // Event listeners
    this._bindEvents();

    // Check WebXR support
    if ('xr' in navigator) {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
      if (supported) {
        this._setupVRButton();
      } else {
        document.getElementById('vr-button').textContent = 'VR NOT SUPPORTED';
      }
    } else {
      document.getElementById('vr-button').textContent = 'WEBXR UNAVAILABLE';
    }

    // Mark loaded
    this.loaded = true;
    document.getElementById('loading-screen').classList.add('hidden');

    // Start animation loop
    this._animate();
  }

  _bindEvents() {
    const canvas = this.sceneManager.getRenderer().domElement;

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.startVRSession();
      if (e.code === 'Escape' && this.isVRRunning) this.endVRSession();
      if (e.code === 'KeyR') this.vessel.reset();
    });

    // Mouse (desktop debug)
    canvas.addEventListener('mousemove', (e) => {
      this.mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.vessel.setWipeFromMouse(this.mouseNDC.x, this.mouseNDC.y);
    });

    canvas.addEventListener('mousedown', () => {
      this.mouseDown = true;
      this.vessel.isWiping = true;
    });
    canvas.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this.vessel.isWiping = false;
      this.vessel._updateTrailTexture();
    });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.mouseDown = true;
      this.vessel.isWiping = true;
    }, { passive: false });
    canvas.addEventListener('touchend', () => {
      this.mouseDown = false;
      this.vessel.isWiping = false;
      this.vessel._updateTrailTexture();
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this.mouseNDC.x =  (t.clientX / window.innerWidth)  * 2 - 1;
      this.mouseNDC.y = -(t.clientY / window.innerHeight) * 2 + 1;
      this.vessel.setWipeFromMouse(this.mouseNDC.x, this.mouseNDC.y);
    }, { passive: false });

    // Show debug overlay on first interaction
    const showDebug = () => {
      document.getElementById('debug-overlay').classList.add('visible');
      window.removeEventListener('click', showDebug);
    };
    window.addEventListener('click', showDebug);
  }

  _setupVRButton() {
    const btn = document.getElementById('vr-button');
    btn.disabled = false;
    btn.textContent = 'ENTER VR';

    btn.addEventListener('click', () => {
      if (!this.isVRRunning) {
        this.startVRSession();
      } else {
        this.endVRSession();
      }
    });

    // Wire to renderer VR button
    this.sceneManager.getRenderer().xr.getSessionButton = () => btn;
  }

  async startVRSession() {
    try {
      const btn = document.getElementById('vr-button');
      if (btn) {
        btn.textContent = 'STARTING VR...';
        btn.disabled = true;
      }

      const sessionInit = this.vessel.getSessionInitOptions();
      console.log('Requesting VR session with options:', sessionInit);

      const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
      console.log('VR session created:', session);

      session.addEventListener('end', () => {
        this.isVRRunning = false;
        const btn = document.getElementById('vr-button');
        if (btn) {
          btn.textContent = 'ENTER VR';
          btn.disabled = false;
        }
      });

      // Set reference space BEFORE setting session
      this.vessel.referenceSpace = await session.requestReferenceSpace('local-floor');
      console.log('Reference space acquired');

      await this.sceneManager.getRenderer().xr.setSession(session);
      this.isVRRunning = true;

      this.vessel.xrSession = session;

      if (btn) {
        btn.textContent = 'EXIT VR';
        btn.disabled = false;
      }

      console.log('VR session started successfully');

    } catch (err) {
      console.error('Failed to start VR session:', err);
      const btn = document.getElementById('vr-button');
      if (btn) {
        btn.textContent = 'VR ERROR - TRY REFRESH';
        btn.disabled = false;
      }
      
      // Show detailed error
      const info = document.getElementById('info-panel');
      if (info) {
        info.innerHTML = `
          <div class="info-title" style="color: #ff6b6b;">VR Error</div>
          <div class="info-sub" style="margin-top: 8px;">${err.message}</div>
          <div class="info-sub" style="margin-top: 4px; font-size: 10px;">Try: Pico Browser → Settings → Enable WebXR</div>
        `;
      }
    }
  }

  endVRSession() {
    if (this.vessel.xrSession) {
      this.vessel.xrSession.end();
      this.vessel.xrSession = null;
    }
  }

  _processXRInput() {
    if (this.vessel.xrSession) {
      this.vessel.processXRInput(this.vessel.xrSession);
    }
  }

  _animate() {
    this.sceneManager.getRenderer().setAnimationLoop((time) => {
      const delta = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // Update scene
      this.sceneManager.update(elapsed);

      // Update vessel
      this._processXRInput();
      this.vessel.update(elapsed, delta);

      // Render
      this.sceneManager.getRenderer().render(
        this.sceneManager.getScene(),
        this.sceneManager.getCamera()
      );
    });
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', async () => {
  const app = new KleinApp();
  await app.init();
});
