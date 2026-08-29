import * as THREE from 'three';

export class LumisleCamera {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.moveSpeed = 0.5;
        this.lookSpeed = 0.002;
        
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false
        };

        this.init();
    }

    init() {
        // Mouse look
        this.domElement.addEventListener('click', () => {
            this.domElement.requestPointerLock();
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.domElement) {
                const euler = new THREE.Euler(0, 0, 0, 'YXZ');
                euler.setFromQuaternion(this.camera.quaternion);
                
                euler.y -= e.movementX * this.lookSpeed;
                euler.x -= e.movementY * this.lookSpeed;
                
                // Clamp vertical look to 90 degrees
                euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
                
                this.camera.quaternion.setFromEuler(euler);
            }
        });

        // Keyboard movement
        window.addEventListener('keydown', (e) => this.onKey(e.code, true));
        window.addEventListener('keyup', (e) => this.onKey(e.code, false));
    }

    onKey(code, isDown) {
        switch (code) {
            case 'KeyW': this.keys.forward = isDown; break;
            case 'KeyS': this.keys.backward = isDown; break;
            case 'KeyA': this.keys.left = isDown; break;
            case 'KeyD': this.keys.right = isDown; break;
            case 'Space': this.keys.up = isDown; break;
            case 'ShiftLeft': this.keys.down = isDown; break;
        }
    }

    update() {
        this.direction.z = Number(this.keys.backward) - Number(this.keys.forward);
        this.direction.x = Number(this.keys.right) - Number(this.keys.left);
        this.direction.y = Number(this.keys.up) - Number(this.keys.down);
        this.direction.normalize();

        // Calculate movement relative to camera rotation
        const camQuat = this.camera.quaternion;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
        const up = new THREE.Vector3(0, 1, 0);

        if (this.keys.forward) this.camera.position.addScaledVector(forward, this.moveSpeed);
        if (this.keys.backward) this.camera.position.addScaledVector(forward, -this.moveSpeed);
        if (this.keys.left) this.camera.position.addScaledVector(right, -this.moveSpeed);
        if (this.keys.right) this.camera.position.addScaledVector(right, this.moveSpeed);
        if (this.keys.up) this.camera.position.addScaledVector(up, this.moveSpeed);
        if (this.keys.down) this.camera.position.addScaledVector(up, -this.moveSpeed);
    }
}