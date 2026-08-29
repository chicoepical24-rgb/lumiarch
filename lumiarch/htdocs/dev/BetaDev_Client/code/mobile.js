import { keys } from './player.js';

const mobileControls = {
    active: false,
    touchStart: { x: 0, y: 0 },
    joystickRadius: 50,
    cameraTouchId: null,
    lastCameraPos: { x: 0, y: 0 },
    sensitivity: 0.008,
    pinchDist: 0,
    lastTapTime: 0
};

export function initMobileControls() {
    const isTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const forceMobile = window.location.hash === '#mobile' || window.location.search.includes('mobile=true');

    if (!isTouch && !forceMobile) {
        console.log("Mobile controls skipped: Not a touch device.");
        return;
    }

    console.log("Initializing Mobile Controls...");

    // --- 1. UI Elements ---

    const leftZone = document.createElement('div');
    leftZone.id = 'joystick-zone';
    leftZone.style.cssText = `
        position: fixed; bottom: 50px; left: 50px; width: 150px; height: 150px;
        background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2);
        border-radius: 50%; z-index: 999999; touch-action: none;
    `;

    const joystick = document.createElement('div');
    joystick.style.cssText = `
        position: absolute; top: 50%; left: 50%; width: 60px; height: 60px;
        background: rgba(255,255,255,0.5); border-radius: 50%;
        transform: translate(-50%, -50%); pointer-events: none;
    `;

    const jumpBtn = document.createElement('div');
    jumpBtn.id = 'jump-btn';
    jumpBtn.style.cssText = `
        position: fixed; bottom: 70px; right: 60px; width: 100px; height: 100px;
        background: rgba(255,255,255,0.1); border: 3px solid rgba(255,255,255,0.5);
        border-radius: 50%; z-index: 999999; display: flex;
        align-items: center; justify-content: center; color: white;
        font-family: sans-serif; font-weight: bold; font-size: 20px;
        user-select: none; touch-action: none;
    `;
    jumpBtn.innerText = "JUMP";

    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); color: white; z-index: 1000000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: sans-serif; text-align: center; padding: 20px; box-sizing: border-box;
    `;
    overlay.innerHTML = `
        <h2 style="margin-bottom: 20px;">Fullscreen Required</h2>
        <p style="margin-bottom: 30px;">Please enter fullscreen mode to play on mobile.</p>
        <button id="enter-fs-btn" style="
            padding: 15px 30px; font-size: 18px; background: #fff; color: #000;
            border: none; border-radius: 5px; cursor: pointer; font-weight: bold;
        ">START GAME</button>
    `;

    function resetJoystick() {
        mobileControls.active = false;
        if (joystick) joystick.style.transform = 'translate(-50%, -50%)';
        keys.w = keys.s = keys.a = keys.d = false;
    }

    const handleFsChange = () => {
        if (!document.fullscreenElement) {
            overlay.style.display = 'flex';
            resetJoystick(); 
            keys.space = false;
        } else {
            overlay.style.display = 'none';
        }
    };

    document.body.appendChild(leftZone);
    leftZone.appendChild(joystick);
    document.body.appendChild(jumpBtn);
    document.body.appendChild(overlay);

    const enterBtn = overlay.querySelector('#enter-fs-btn');
    enterBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop overlay click from moving cam
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().then(() => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(() => {});
                }
            }).catch(err => console.error(err));
        }
    });

    document.addEventListener('fullscreenchange', handleFsChange);
    handleFsChange();

    const getPinchDist = (t1, t2) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    // --- 2. Joystick Movement Logic ---

    leftZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation(); // CRITICAL: Prevents window-level camera logic from seeing this touch
        mobileControls.active = true;
        const rect = leftZone.getBoundingClientRect();
        mobileControls.touchStart = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }, { passive: false });

    leftZone.addEventListener('touchmove', (e) => {
        e.stopPropagation(); // Keep movement internal
        if (!mobileControls.active) return;
        const touch = e.touches[0];
        const dx = touch.clientX - mobileControls.touchStart.x;
        const dy = touch.clientY - mobileControls.touchStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = mobileControls.joystickRadius;

        const angle = Math.atan2(dy, dx);
        const limitedDist = Math.min(dist, maxDist);

        joystick.style.transform = `translate(calc(-50% + ${Math.cos(angle) * limitedDist}px), calc(-50% + ${Math.sin(angle) * limitedDist}px))`;

        const moveX = Math.cos(angle) * (limitedDist / maxDist);
        const moveY = Math.sin(angle) * (limitedDist / maxDist);

        keys.w = moveY < -0.3;
        keys.s = moveY > 0.3;
        keys.a = moveX < -0.3;
        keys.d = moveX > 0.3;
    }, { passive: false });

    leftZone.addEventListener('touchend', (e) => {
        e.stopPropagation();
        resetJoystick();
    });

    // --- 3. Jump Logic ---

    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation(); // CRITICAL: Prevents camera rotation when jumping
        keys.space = true;
        jumpBtn.style.background = "rgba(255,255,255,0.4)";
    }, { passive: false });

    jumpBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        keys.space = false;
        jumpBtn.style.background = "rgba(255,255,255,0.1)";
    });

    // --- 4. Camera / Zoom / Tap Logic ---

    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            mobileControls.pinchDist = getPinchDist(e.touches[0], e.touches[1]);
            return;
        }

        const touch = e.changedTouches[0];
        
        // Secondary safety check for GUI targets
        const isGUI = touch.target === leftZone || leftZone.contains(touch.target) || 
                      touch.target === jumpBtn || touch.target.closest('#fullscreen-overlay');

        if (!isGUI && mobileControls.cameraTouchId === null) {
            mobileControls.cameraTouchId = touch.identifier;
            mobileControls.lastCameraPos = { x: touch.clientX, y: touch.clientY };
            mobileControls.lastTapTime = Date.now();
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const newDist = getPinchDist(e.touches[0], e.touches[1]);
            const diff = newDist - mobileControls.pinchDist;
            
            if (typeof window.cameraDistance !== 'undefined') {
                window.cameraDistance = Math.max(2.0, Math.min(100, window.cameraDistance - diff * 0.1));
            }
            mobileControls.pinchDist = newDist;
            return;
        }

        const touch = Array.from(e.touches).find(t => t.identifier === mobileControls.cameraTouchId);
        if (!touch) return;

        const movementX = touch.clientX - mobileControls.lastCameraPos.x;
        const movementY = touch.clientY - mobileControls.lastCameraPos.y;

        if (typeof window.cameraYaw !== 'undefined') {
            window.cameraYaw -= movementX * mobileControls.sensitivity;
            // Drag down (positive movementY) increases pitch (looking down)
            window.cameraPitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, (window.cameraPitch || 0) + movementY * mobileControls.sensitivity));
        }

        mobileControls.lastCameraPos = { x: touch.clientX, y: touch.clientY };
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === mobileControls.cameraTouchId);
        
        if (touch) {
            const duration = Date.now() - mobileControls.lastTapTime;
            const dxMove = Math.abs(touch.clientX - mobileControls.lastCameraPos.x);
            const dyMove = Math.abs(touch.clientY - mobileControls.lastCameraPos.y);

            if (duration < 250 && dxMove < 15 && dyMove < 15) {
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                const offX = (touch.clientX - centerX) / window.innerWidth;
                const offY = (touch.clientY - centerY) / window.innerHeight;

                if (typeof window.cameraYaw !== 'undefined') {
                    window.cameraYaw -= offX * 0.5; 
                    window.cameraPitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, (window.cameraPitch || 0) + offY * 0.5));
                }
            }
            mobileControls.cameraTouchId = null;
        }
    });
}