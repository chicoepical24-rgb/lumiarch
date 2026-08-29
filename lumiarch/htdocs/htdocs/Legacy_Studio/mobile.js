var mobileControls = {
    joystick: { x: 0, y: 0, active: false, identifier: null, base: null, stick: null },
    jumpButton: { active: false, identifier: null, element: null },
    moveVector: new THREE.Vector2(0, 0)
};

function setupMobileUI() {
    // Create Joystick Base
    var base = document.createElement('div');
    base.style.width = '120px';
    base.style.height = '120px';
    base.style.background = 'rgba(255, 255, 255, 0.2)';
    base.style.borderRadius = '50%';
    base.style.position = 'absolute';
    base.style.bottom = '50px';
    base.style.left = '50px';
    base.style.touchAction = 'none';
    base.style.border = '2px solid rgba(255, 255, 255, 0.4)';
    document.body.appendChild(base);
    mobileControls.joystick.base = base;

    // Create Stick
    var stick = document.createElement('div');
    stick.style.width = '60px';
    stick.style.height = '60px';
    stick.style.background = 'rgba(255, 255, 255, 0.5)';
    stick.style.borderRadius = '50%';
    stick.style.position = 'absolute';
    stick.style.top = '30px';
    stick.style.left = '30px';
    base.appendChild(stick);
    mobileControls.joystick.stick = stick;

    // Create Jump Button
    var jump = document.createElement('div');
    jump.style.width = '80px';
    jump.style.height = '80px';
    jump.style.background = 'rgba(255, 255, 255, 0.2)';
    jump.style.borderRadius = '50%';
    jump.style.position = 'absolute';
    jump.style.bottom = '70px';
    jump.style.right = '50px';
    jump.style.touchAction = 'none';
    jump.style.border = '2px solid rgba(255, 255, 255, 0.4)';
    jump.innerHTML = '<div style="color:white; text-align:center; line-height:80px; font-family:sans-serif; user-select:none;">JUMP</div>';
    document.body.appendChild(jump);
    mobileControls.jumpButton.element = jump;

    bindTouchEvents();
}

function bindTouchEvents() {
    window.addEventListener('touchstart', function(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            
            // Check Jump
            var rectJ = mobileControls.jumpButton.element.getBoundingClientRect();
            if (t.clientX >= rectJ.left && t.clientX <= rectJ.right && t.clientY >= rectJ.top && t.clientY <= rectJ.bottom) {
                mobileControls.jumpButton.active = true;
                mobileControls.jumpButton.identifier = t.identifier;
                if (typeof onJumpPress === "function") onJumpPress();
            }

            // Check Joystick
            var rectB = mobileControls.joystick.base.getBoundingClientRect();
            if (t.clientX >= rectB.left && t.clientX <= rectB.right && t.clientY >= rectB.top && t.clientY <= rectB.bottom) {
                mobileControls.joystick.active = true;
                mobileControls.joystick.identifier = t.identifier;
            }
        }
    });

    window.addEventListener('touchmove', function(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (mobileControls.joystick.active && t.identifier === mobileControls.joystick.identifier) {
                var rect = mobileControls.joystick.base.getBoundingClientRect();
                var centerX = rect.left + rect.width / 2;
                var centerY = rect.top + rect.height / 2;
                
                var dx = t.clientX - centerX;
                var dy = t.clientY - centerY;
                var dist = Math.sqrt(dx*dx + dy*dy);
                var maxRadius = 40;

                if (dist > maxRadius) {
                    dx *= maxRadius / dist;
                    dy *= maxRadius / dist;
                }

                mobileControls.joystick.stick.style.transform = `translate(${dx}px, ${dy}px)`;
                mobileControls.moveVector.set(dx / maxRadius, -dy / maxRadius);
            }
        }
    });

    window.addEventListener('touchend', function(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (t.identifier === mobileControls.joystick.identifier) {
                mobileControls.joystick.active = false;
                mobileControls.joystick.identifier = null;
                mobileControls.joystick.stick.style.transform = `translate(0px, 0px)`;
                mobileControls.moveVector.set(0, 0);
            }
            if (t.identifier === mobileControls.jumpButton.identifier) {
                mobileControls.jumpButton.active = false;
                mobileControls.jumpButton.identifier = null;
            }
        }
    });
}

setupMobileUI();