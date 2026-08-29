// camera.js
import * as THREE from 'three';

export class LumisleCamera {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.lookSpeed = 0.005;
        this.zoomSpeed = 1.0; 
        this.minDistance = 3; // Set to 0.5 to prevent clipping into head
        this.maxDistance = 100;
        
        this.distance = 20;
        this.yaw = 0;   
        this.pitch = 0.3; 
        this.isRightClickDown = false;
        
        window.cameraYaw = this.yaw;
        window.cameraPitch = this.pitch;
        window.cameraDistance = this.distance;
        
        this.init();
    }

    init() {
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                this.isRightClickDown = true;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) this.isRightClickDown = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isRightClickDown) {
                this.yaw -= e.movementX * this.lookSpeed;
                this.pitch += e.movementY * this.lookSpeed;
                const limit = Math.PI / 2 - 0.01;
                this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
                window.cameraYaw = this.yaw;
                window.cameraPitch = this.pitch;
            }
        });

        window.addEventListener('wheel', (e) => {
            this.distance += e.deltaY * 0.02 * this.zoomSpeed;
            this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
            window.cameraDistance = this.distance;
        }, { passive: true });
    }

    update(scene) {
        this.yaw = window.cameraYaw;
        this.pitch = window.cameraPitch;
        if (window.cameraDistance !== undefined) {
            this.distance = window.cameraDistance;
        }

        const targetPos = new THREE.Vector3();
        const head = window.localPlayerHead;
        const body = window.characterBody; 

        if (head) {
            head.getWorldPosition(targetPos);
        } else if (body) {
            if (body.position instanceof THREE.Vector3) {
                body.getWorldPosition(targetPos);
            } else {
                targetPos.set(body.position.x, body.position.y, body.position.z);
            }
            targetPos.y += 1.5; 
        } else {
            return;
        }

        const horizontalDist = this.distance * Math.cos(this.pitch);
        const x = targetPos.x + horizontalDist * Math.sin(this.yaw);
        const y = targetPos.y + (this.distance * Math.sin(this.pitch));
        const z = targetPos.z + horizontalDist * Math.cos(this.yaw);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(targetPos);
    }
}