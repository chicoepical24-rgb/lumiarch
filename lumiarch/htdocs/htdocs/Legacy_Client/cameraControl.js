let isRightMouseDown = false;
window.camTheta = 45; 
let phi = 60;
let radius = 30;

// Mobile specific variables
let lastTouchX = 0;
let lastTouchY = 0;
let lastPinchDist = 0;
const isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0);

function updateCamera() {
    if (!camera) return;
    
    const thetaRad = -window.camTheta * Math.PI / 180;
    const phiRad = phi * Math.PI / 180;
    
    const x = radius * Math.sin(phiRad) * Math.cos(thetaRad);
    const y = radius * Math.cos(phiRad);
    const z = radius * Math.sin(phiRad) * Math.sin(thetaRad);
    
    if (window.characterMesh) {
        const targetPos = window.characterMesh.position;
        camera.position.set(targetPos.x + x, targetPos.y + y, targetPos.z + z);
        camera.lookAt(targetPos);
    } else {
        camera.position.set(x, y, z);
        camera.lookAt(0, 0, 0);
    }
}

// --- PC CONTROLS ---
window.addEventListener('mousedown', (e) => { 
    if (e.button === 2) isRightMouseDown = true; 
});

window.addEventListener('mouseup', (e) => { 
    if (e.button === 2) isRightMouseDown = false; 
});

window.addEventListener('mousemove', (e) => {
    if (isRightMouseDown) {
        window.camTheta -= e.movementX * 0.5;
        phi -= e.movementY * 0.5;
        phi = Math.max(10, Math.min(170, phi));
    }
});

window.addEventListener('wheel', (e) => {
    radius += e.deltaY * 0.05;
    radius = Math.max(5, Math.min(100, radius));
});

// --- MOBILE CONTROLS---
window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        // Only track for camera if this touch isn't the joystick or jump button
        const t = e.touches[0];
        if (t.identifier !== mobileControls.joystick.identifier && 
            t.identifier !== mobileControls.jumpButton.identifier) {
            lastTouchX = t.pageX;
            lastTouchY = t.pageY;
        }
    } else if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    // Rotation (One finger)
    if (e.touches.length === 1) {
        const t = e.touches[0];

        // IGNORE if this touch is currently operating the joystick or jump button
        if (t.identifier === mobileControls.joystick.identifier || 
            t.identifier === mobileControls.jumpButton.identifier) {
            return; 
        }

        const touchX = t.pageX;
        const touchY = t.pageY;
        
        const movementX = touchX - lastTouchX;
        const movementY = touchY - lastTouchY;

        window.camTheta -= movementX * 0.5;
        phi -= movementY * 0.5;
        phi = Math.max(10, Math.min(170, phi));

        lastTouchX = touchX;
        lastTouchY = touchY;
    } 
    // Pinch Zoom (Two fingers)
    else if (e.touches.length === 2) {
        const currentDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        
        const delta = currentDist - lastPinchDist;
        radius -= delta * 0.1;
        radius = Math.max(5, Math.min(100, radius));
        
        lastPinchDist = currentDist;
    }
    
    if (e.cancelable) e.preventDefault();
}, { passive: false });

// Prevent context menu
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.updateCamera = updateCamera;