var moveState = { forward: 0, back: 0, left: 0, right: 0 };
var mouseState = { rightDown: false };
var moveSpeed = 0.5;
var lookSensitivity = 0.002;

var pitch = 0;
var yaw = 0;

var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// --- PC KEYBOARD EVENTS ---
document.addEventListener('keydown', function(e) {
    if (e.code === 'KeyW') moveState.forward = 1;
    if (e.code === 'KeyS') moveState.back = 1;
    if (e.code === 'KeyA') moveState.left = 1;
    if (e.code === 'KeyD') moveState.right = 1;
});

document.addEventListener('keyup', function(e) {
    if (e.code === 'KeyW') moveState.forward = 0;
    if (e.code === 'KeyS') moveState.back = 0;
    if (e.code === 'KeyA') moveState.left = 0;
    if (e.code === 'KeyD') moveState.right = 0;
});

// --- MOUSE EVENTS ---
document.addEventListener('mousedown', function(e) {
    if (e.button === 2) mouseState.rightDown = true;
});

document.addEventListener('mouseup', function(e) {
    if (e.button === 2) mouseState.rightDown = false;
});

document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
    if (mouseState.rightDown && camera && !window.isToolActive) {
        yaw -= e.movementX * lookSensitivity;
        pitch -= e.movementY * lookSensitivity;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
        
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitch, yaw, 0);
    }
});

// --- MOBILE TOUCH EVENTS ---
if (isMobile) {
    document.addEventListener('touchstart', function(e) {
        // Mobile "Right Click" emulation: if touching with two fingers, start looking
        if (e.touches.length === 2) mouseState.rightDown = true;
    });

    document.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) mouseState.rightDown = false;
    });

    let lastTouchX = 0;
    let lastTouchY = 0;

    document.addEventListener('touchmove', function(e) {
        if (mouseState.rightDown && camera) {
            let touch = e.touches[0];
            let movementX = touch.pageX - lastTouchX;
            let movementY = touch.pageY - lastTouchY;

            // Use movement to rotate camera
            yaw -= movementX * lookSensitivity;
            pitch -= movementY * lookSensitivity;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
            
            camera.rotation.order = 'YXZ';
            camera.rotation.set(pitch, yaw, 0);
        }
        lastTouchX = e.touches[0].pageX;
        lastTouchY = e.touches[0].pageY;
    });

    createMobileUI();
}

function createMobileUI() {
    const ui = document.createElement('div');
    ui.id = "mobile-controls";
    ui.style.cssText = "position:fixed; bottom:20px; left:20px; display:grid; grid-template-columns: repeat(3, 50px); gap:10px; z-index:1000;";
    
    // Simple 3D Engine style D-Pad
    ui.innerHTML = `
        <div style="grid-column: 2"><button id="btn-w" style="width:50px; height:50px;">W</button></div>
        <div style="grid-column: 1"><button id="btn-a" style="width:50px; height:50px;">A</button></div>
        <div style="grid-column: 2"><button id="btn-s" style="width:50px; height:50px;">S</button></div>
        <div style="grid-column: 3"><button id="btn-d" style="width:50px; height:50px;">D</button></div>
    `;
    document.body.appendChild(ui);

    const bind = (id, key) => {
        const btn = document.getElementById(id);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); moveState[key] = 1; });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); moveState[key] = 0; });
    };

    bind('btn-w', 'forward');
    bind('btn-s', 'back');
    bind('btn-a', 'left');
    bind('btn-d', 'right');
}

function updateCamera() {
    if (!camera) return;

    var direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    var right = new THREE.Vector3();
    right.crossVectors(camera.up, direction).normalize();

    if (moveState.forward) camera.position.addScaledVector(direction, moveSpeed);
    if (moveState.back) camera.position.addScaledVector(direction, -moveSpeed);
    if (moveState.left) camera.position.addScaledVector(right, moveSpeed);
    if (moveState.right) camera.position.addScaledVector(right, -moveSpeed);
}