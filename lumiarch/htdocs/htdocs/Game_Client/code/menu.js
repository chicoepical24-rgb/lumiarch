// menu.js DONT DELETE
import { manualReset } from './player.js';

window.toggleMenu = () => {
    const modal = document.getElementById('menu-modal');
    if (!modal) return;
    const isOpen = modal.classList.toggle('open');
    if (isOpen && document.pointerLockElement) {
        document.exitPointerLock();
    }
};

export function initMenu(renderer, scene, world) {
    const modal = document.getElementById('menu-modal');

    window.takeScreenshot = () => {
        renderer.render(scene, scene.userData.activeCamera || scene.children.find(c => c.isCamera));
        
        const canvas = renderer.domElement;
        const link = document.createElement('a');
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}`;
        
        link.download = `Lumisle_Capture_${timestamp}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        window.toggleMenu();
    };

    window.resetCharacter = () => {
        manualReset(scene, world);
        window.toggleMenu();
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            window.toggleMenu();
        }
    });

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.toggleMenu();
        });
    }
}