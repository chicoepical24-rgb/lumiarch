document.addEventListener('DOMContentLoaded', function() {
    var btnExit = document.getElementById('btn-exit');
    var btnLoad = document.getElementById('btn-load');
    var btnInfo = document.getElementById('btn-info');
    var btnFullscreen = document.getElementById('btn-fullscreen'); 
    var fileInput = document.getElementById('map-loader');
    
    if (btnExit) {
        btnExit.onclick = function() {
            window.location.href = "https://lumisle.rf.gd/Games"; 
        };
    }
    
    if (btnInfo) {
        btnInfo.onclick = function() {
            // Create the container div
            var helpOverlay = document.createElement('div');
            helpOverlay.id = 'help-overlay';
            helpOverlay.style.position = 'fixed';
            helpOverlay.style.top = '0';
            helpOverlay.style.left = '0';
            helpOverlay.style.width = '100%';
            helpOverlay.style.height = '100%';
            helpOverlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
            helpOverlay.style.color = 'black';
            helpOverlay.style.display = 'flex';
            helpOverlay.style.flexDirection = 'column';
            helpOverlay.style.alignItems = 'center';
            helpOverlay.style.justifyContent = 'center';
            helpOverlay.style.zIndex = '1000';
            helpOverlay.style.fontFamily = 'comicsans';

            // Set the content
            helpOverlay.innerHTML = 
                '<div style="border: 1px solid black; background-color: rgba(175,175,175,1); padding: 20px;">' +
                '<h2>Galaxia Player</h2>' +
                '<h3>PC Controls</h3>' +
                '<p>WASD - Move<br>Space - Jump<br>Right Click - Move Camera<br>Middle Scroll - Zoom Camera</p>' +
                '<h3>Mobile Controls</h3>' +
                '<p>Left Joystick - Move<br>Tap Button - Jump<br>Tap and Hold - Rotate Camera<br>Pinch - Zoom in and Out</p>' +
                '</div>' +
                '<button id="close-help" style="border: 1px solid #000; margin-top: 20px; padding: 10px 20px; cursor: pointer;">Close</button>';

            document.body.appendChild(helpOverlay);

            // Close logic
            document.getElementById('close-help').onclick = function() {
                document.body.removeChild(helpOverlay);
            };
        };
    }

    if (btnFullscreen) {
        btnFullscreen.onclick = function() {
            if (!document.fullscreenElement) {
                // Enter fullscreen
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };
    }

    if (fileInput) {
        fileInput.onchange = function(e) {
            console.log("File selection detected, but map loading is currently disabled.");
            fileInput.value = ''; 
        };
    }
});