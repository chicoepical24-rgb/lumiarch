import * as THREE from 'three';

export class LumisleCamera {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.lookSpeed = 0.005;
        this.zoomSpeed = 1.0; 
        this.minDistance = 2.0; // Don't let it clip into the head
        this.maxDistance = 100;
        
        this.distance = 20;
        this.yaw = 0;   
        this.pitch = 0.3; 
        this.isRightClickDown = false;
        
        // Initialize global values so mobile.js has a starting point
        window.cameraYaw = this.yaw;
        window.cameraPitch = this.pitch;
        window.cameraDistance = this.distance;
        
        this.init();
    }

    init() {
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) this.isRightClickDown = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) this.isRightClickDown = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isRightClickDown) {
                // Subtract movementX to rotate with the mouse naturally
                this.yaw -= e.movementX * this.lookSpeed;
                this.pitch += e.movementY * this.lookSpeed;

                // Clamp pitch to avoid flipping over the top/bottom (89 degrees)
                const limit = Math.PI / 2 - 0.01;
                this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

                // Sync internal changes to globals
                window.cameraYaw = this.yaw;
                window.cameraPitch = this.pitch;
            }
        });

        window.addEventListener('wheel', (e) => {
            this.distance += e.deltaY * 0.02 * this.zoomSpeed;
            this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
            
            // Sync zoom to global
            window.cameraDistance = this.distance;
        }, { passive: true });
    }

    update(scene) {
        // Pull updates from mobile.js (Globals -> Internal)
        this.yaw = window.cameraYaw;
        this.pitch = window.cameraPitch;
        if (window.cameraDistance !== undefined) {
            this.distance = window.cameraDistance;
        }

        if (!window.characterBody) return;

        const playerGroup = scene.getObjectByName("PlayerCharacter");
        const head = playerGroup ? playerGroup.getObjectByName("Head") : null;
        
        const targetPos = new THREE.Vector3();
        if (head) {
            head.getWorldPosition(targetPos);
        } else {
            // Fallback to physics body center + height offset
            targetPos.copy(window.characterBody.position);
            targetPos.y += 1.5; 
        }

        // Standard Spherical to Cartesian conversion
        // x = dist * cos(pitch) * sin(yaw)
        // y = dist * sin(pitch)
        // z = dist * cos(pitch) * cos(yaw)
        
        const horizontalDist = this.distance * Math.cos(this.pitch);
        
        const x = targetPos.x + horizontalDist * Math.sin(this.yaw);
        const y = targetPos.y + (this.distance * Math.sin(this.pitch));
        const z = targetPos.z + horizontalDist * Math.cos(this.yaw);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(targetPos);
    }
}