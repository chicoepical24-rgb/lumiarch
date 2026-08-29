(function() {
    // Detect mobile: check for touch capability AND a mobile-like user agent
    const isMobile = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) && 
                     /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!isMobile) return;

    var mobileControls = {
        joystick: { x: 0, y: 0, active: false, identifier: null, base: null, stick: null },
        jumpButton: { active: false, identifier: null, element: null },
        moveVector: new THREE.Vector2(0, 0)
    };

    function setupMobileUI() {
        // 1. Create Joystick Base
        var base = document.createElement('div');
        base.id = 'mobile-joystick-base';
        base.style.width = '25vmin';
        base.style.height = '25vmin';
        base.style.background = 'rgba(212, 208, 200, 0.4)';
        base.style.borderRadius = '50%';
        base.style.position = 'absolute';
        base.style.bottom = '8vmin';
        base.style.left = '8vmin';
        base.style.touchAction = 'none';
        base.style.border = '0.5vmin double #808080';
        base.style.zIndex = '2000';
        document.body.appendChild(base);
        mobileControls.joystick.base = base;

        // 2. Create Stick
        var stick = document.createElement('div');
        stick.id = 'mobile-joystick-stick';
        stick.style.width = '10vmin';
        stick.style.height = '10vmin';
        stick.style.background = '#d4d0c8';
        stick.style.borderRadius = '50%';
        stick.style.position = 'absolute';
        stick.style.top = '7.5vmin';
        stick.style.left = '7.5vmin';
        stick.style.border = '0.3vmin solid #ffffff';
        stick.style.boxShadow = 'inset -1px -1px #808080, 1px 1px #000';
        base.appendChild(stick);
        mobileControls.joystick.stick = stick;

        // 3. Create Jump Button
        var jump = document.createElement('div');
        jump.id = 'mobile-jump-button';
        jump.style.width = '18vmin';
        jump.style.height = '18vmin';
        jump.style.background = '#d4d0c8';
        jump.style.borderRadius = '50%';
        jump.style.position = 'absolute';
        jump.style.bottom = '10vmin';
        jump.style.right = '8vmin';
        jump.style.touchAction = 'none';
        jump.style.border = '0.3vmin solid #ffffff';
        jump.style.boxShadow = 'inset -1px -1px #808080, 2px 2px #000';
        jump.style.zIndex = '2000';
        
        var label = document.createElement('div');
        label.style.color = 'black';
        label.style.textAlign = 'center';
        label.style.lineHeight = '18vmin';
        label.style.fontFamily = '"Tahoma", sans-serif';
        label.style.fontSize = '2.5vmin';
        label.style.fontWeight = 'bold';
        label.style.userSelect = 'none';
        label.innerText = 'JUMP';
        
        jump.appendChild(label);
        document.body.appendChild(jump);
        mobileControls.jumpButton.element = jump;

        bindTouchEvents();
    }

    function bindTouchEvents() {
        window.addEventListener('touchstart', function(e) {
            for (var i = 0; i < e.changedTouches.length; i++) {
                var t = e.changedTouches[i];
                
                var rectJ = mobileControls.jumpButton.element.getBoundingClientRect();
                if (t.clientX >= rectJ.left && t.clientX <= rectJ.right && t.clientY >= rectJ.top && t.clientY <= rectJ.bottom) {
                    mobileControls.jumpButton.active = true;
                    mobileControls.jumpButton.identifier = t.identifier;
                    mobileControls.jumpButton.element.style.boxShadow = 'inset 2px 2px #000';
                }

                var rectB = mobileControls.joystick.base.getBoundingClientRect();
                if (t.clientX >= rectB.left && t.clientX <= rectB.right && t.clientY >= rectB.top && t.clientY <= rectB.bottom) {
                    mobileControls.joystick.active = true;
                    mobileControls.joystick.identifier = t.identifier;
                }
            }
        }, { passive: false });

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
                    var maxRadius = rect.width / 2;

                    if (dist > maxRadius) {
                        dx *= maxRadius / dist;
                        dy *= maxRadius / dist;
                    }

                    mobileControls.joystick.stick.style.transform = `translate(${dx}px, ${dy}px)`;
                    mobileControls.moveVector.set(dx / maxRadius, -dy / maxRadius);
                }
            }
            if (e.touches.length > 0) e.preventDefault();
        }, { passive: false });

        window.addEventListener('touchcancel', function(e) {
            mobileControls.joystick.active = false;
            mobileControls.joystick.identifier = null;
            mobileControls.joystick.stick.style.transform = `translate(0px, 0px)`;
            mobileControls.moveVector.set(0, 0);
            mobileControls.jumpButton.active = false;
            mobileControls.jumpButton.element.style.boxShadow = 'inset -1px -1px #808080, 2px 2px #000';
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
                    mobileControls.jumpButton.element.style.boxShadow = 'inset -1px -1px #808080, 2px 2px #000';
                }
            }
        });
    }

    // Execute setup
    setupMobileUI();

    // Export mobileControls to global scope so other scripts (player.js) can read it
    window.mobileControls = mobileControls;
})();