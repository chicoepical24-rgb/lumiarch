const mobileControls = {
    active: false,
    touchStart: { x: 0, y: 0 },
    joystickRadius: 50,
    cameraTouchId: null,
    lastCameraPos: { x: 0, y: 0 },
    sensitivity: 0.005,
    pinchDist: 0
};

function initMobile() {
    if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;

    const fsBtn = document.createElement('div');
    fsBtn.id = 'fs-btn';
    fsBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 80px;
        padding: 10px;
        background: rgba(0,0,0,0.5);
        color: white;
        border: 1px solid white;
        border-radius: 5px;
        z-index: 1000;
        font-family: sans-serif;
        cursor: pointer;
    `;
    fsBtn.innerText = "⛶ Landscape";
    document.body.appendChild(fsBtn);

    fsBtn.addEventListener('click', () => {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().then(() => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(err => console.warn(err));
                }
            });
        }
    });

    const leftZone = document.createElement('div');
    leftZone.id = 'joystick-zone';
    leftZone.style.cssText = `
        position: absolute;
        bottom: 10vh;
        left: 5vw;
        width: 150px;
        height: 150px;
        background: rgba(255,255,255,0.1);
        border-radius: 50%;
        z-index: 100;
        touch-action: none;
    `;

    const joystick = document.createElement('div');
    joystick.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: 50px;
        height: 50px;
        background: rgba(255,255,255,0.5);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    `;

    const jumpBtn = document.createElement('div');
    jumpBtn.id = 'jump-btn';
    jumpBtn.style.cssText = `
        position: absolute;
        bottom: 15vh;
        right: 8vw;
        width: 80px;
        height: 80px;
        background: rgba(0,0,0,0.4);
        border: 2px solid rgba(255,255,255,0.8);
        border-radius: 50%;
        z-index: 101;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: sans-serif;
        font-weight: bold;
        user-select: none;
        touch-action: none;
    `;
    jumpBtn.innerText = "JUMP";

    leftZone.appendChild(joystick);
    document.body.appendChild(leftZone);
    document.body.appendChild(jumpBtn);

    leftZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        mobileControls.active = true;
        const touch = e.touches[0];
        const rect = leftZone.getBoundingClientRect();
        mobileControls.touchStart = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }, { passive: false });

    leftZone.addEventListener('touchmove', (e) => {
        if (!mobileControls.active) return;
        const touch = Array.from(e.touches).find(t => t.target === leftZone || leftZone.contains(t.target));
        if (!touch) return;

        const dx = touch.clientX - mobileControls.touchStart.x;
        const dy = touch.clientY - mobileControls.touchStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = mobileControls.joystickRadius;

        const angle = Math.atan2(dy, dx);
        const limitedDist = Math.min(dist, maxDist);

        const moveX = Math.cos(angle) * (limitedDist / maxDist);
        const moveY = Math.sin(angle) * (limitedDist / maxDist);

        joystick.style.transform = `translate(calc(-50% + ${Math.cos(angle) * limitedDist}px), calc(-50% + ${Math.sin(angle) * limitedDist}px))`;

        keys.w = moveY < -0.2;
        keys.s = moveY > 0.2;
        keys.a = moveX < -0.2;
        keys.d = moveX > 0.2;
    }, { passive: false });

    leftZone.addEventListener('touchend', () => {
        mobileControls.active = false;
        joystick.style.transform = 'translate(-50%, -50%)';
        keys.w = keys.s = keys.a = keys.d = false;
    });

    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys.space = true;
    }, { passive: false });

    jumpBtn.addEventListener('touchend', () => {
        keys.space = false;
    });

    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            mobileControls.pinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            return;
        }

        const touch = e.changedTouches[0];
        const target = touch.target;
        
        const isGUI = target === leftZone || leftZone.contains(target) || 
                      target === jumpBtn || 
                      target.id === 'exit-button' || 
                      target.id === 'fs-btn';

        if (!isGUI && mobileControls.cameraTouchId === null) {
            mobileControls.cameraTouchId = touch.identifier;
            mobileControls.lastCameraPos = { x: touch.clientX, y: touch.clientY };
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            
            const delta = (currentDist - mobileControls.pinchDist) * 0.1;
            if (typeof cameraDistance !== 'undefined') {
                cameraDistance = Math.max(5, Math.min(50, cameraDistance - delta));
            }
            mobileControls.pinchDist = currentDist;
            return;
        }

        const touch = Array.from(e.touches).find(t => t.identifier === mobileControls.cameraTouchId);
        if (!touch) return;

        const movementX = touch.clientX - mobileControls.lastCameraPos.x;
        const movementY = touch.clientY - mobileControls.lastCameraPos.y;

        if (typeof cameraYaw !== 'undefined' && typeof cameraPitch !== 'undefined') {
            cameraYaw += movementX * mobileControls.sensitivity; // FIXED: Inverted
            cameraPitch += movementY * mobileControls.sensitivity; // FIXED: Inverted
            cameraPitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, cameraPitch));
        }

        mobileControls.lastCameraPos = { x: touch.clientX, y: touch.clientY };
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === mobileControls.cameraTouchId);
        if (touch) mobileControls.cameraTouchId = null;
    });
}

initMobile();