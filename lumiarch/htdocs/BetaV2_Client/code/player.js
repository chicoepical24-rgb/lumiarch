// camera.js
import * as THREE from 'three';

export class LumisleCamera {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        // Settings
        this.lookSpeed = 0.005;
        this.zoomSpeed = 0.5;
        this.minDistance = 2;
        this.maxDistance = 50;
        
        // State
        this.distance = 15;
        this.yaw = 0;   // Horizontal rotation
        this.pitch = 0; // Vertical rotation
        this.isRightClickDown = false;
        
        this.init();
    }

    init() {
        // Prevent context menu on right click so it doesn't pop up while rotating
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) this.isRightClickDown = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) this.isRightClickDown = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isRightClickDown) {
                this.yaw -= e.movementX * this.lookSpeed;
                this.pitch -= e.movementY * this.lookSpeed;

                // Clamp pitch to prevent the camera from flipping over the top
                this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch));
            }
        });

        window.addEventListener('wheel', (e) => {
            this.distance += e.deltaY * 0.01 * this.zoomSpeed;
            this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
        });
    }

    update() {
        // We look for the characterBody globally (set in player.js)
        if (!window.characterBody) return;

        const playerPos = window.characterBody.position;

        // Calculate new camera position based on Yaw, Pitch, and Distance
        const offset = new THREE.Vector3(
            this.distance * Math.sin(this.yaw) * Math.cos(this.pitch),
            this.distance * Math.sin(this.pitch),
            this.distance * Math.cos(this.yaw) * Math.cos(this.pitch)
        );

        // Position camera relative to player
        this.camera.position.set(
            playerPos.x + offset.x,
            playerPos.y + offset.y + 2, // +2 to look at head/torso instead of feet
            playerPos.z + offset.z
        );

        // Always point the camera at the player
        this.camera.lookAt(playerPos.x, playerPos.y + 2, playerPos.z);
    }
}