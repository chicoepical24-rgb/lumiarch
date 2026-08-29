/**
 * camera.js
 * Handles orbiting camera with full 360-degree right-click rotation and zoom.
 */

let cameraDistance = 30;
let cameraYaw = Math.PI / 4; 
let cameraPitch = Math.PI / 4; 

let isRightMouseDown = false;

function initCamera() {
    window.addEventListener('mousedown', (e) => {
        if (e.button === 2) isRightMouseDown = true;
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 2) isRightMouseDown = false;
    });

    window.addEventListener('mousemove', (e) => {
    if (isRightMouseDown) {
        cameraYaw += e.movementX * 0.01;
        cameraPitch += e.movementY * 0.01;

        const limit = Math.PI / 2 - 0.01; 
        cameraPitch = Math.max(-limit, Math.min(limit, cameraPitch));
    }
});

    window.addEventListener('wheel', (e) => {
        cameraDistance += e.deltaY * 0.05;
        cameraDistance = Math.max(5, Math.min(100, cameraDistance));
    }, { passive: false });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
}

function updateCamera() {
    if (typeof rootPart !== 'undefined' && rootPart) {
        
        const offsetX = cameraDistance * Math.cos(cameraYaw) * Math.cos(cameraPitch);
        const offsetY = cameraDistance * Math.sin(cameraPitch);
        const offsetZ = cameraDistance * Math.sin(cameraYaw) * Math.cos(cameraPitch);

        camera.position.set(
            rootPart.position.x + offsetX,
            rootPart.position.y + offsetY,
            rootPart.position.z + offsetZ
        );

        camera.lookAt(rootPart.position);
        
    } else {
        camera.lookAt(0, 0, 0);
    }
}