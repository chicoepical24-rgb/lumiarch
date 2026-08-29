let scene, camera, renderer, world;
let meshes = [], bodies = [];

let ambientLight, sunLight, hemiLight;

const GRAVITY_SCALE = 196.2;
const timeStep = 1 / 60;
let lastTime = performance.now();

window.physicsMaterials = {
    map: new CANNON.Material("mapMaterial"),
};

function initEngine() {
    const container = document.getElementById('viewport');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2; 

    container.appendChild(renderer.domElement);

    ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    ambientLight.name = "AmbientLight";
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    sunLight.name = "SunLight";
    sunLight.position.set(100, 200, 100);
    scene.add(sunLight);

    hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 1.0);
    hemiLight.name = "HemiLight";
    scene.add(hemiLight);

    world = new CANNON.World();
    world.gravity.set(0, -GRAVITY_SCALE, 0);
    
    world.solver.iterations = 40;
    world.solver.tolerance = 0.0001;
    world.broadphase = new CANNON.SAPBroadphase(world);

    const mapContact = new CANNON.ContactMaterial(
        window.physicsMaterials.map,
        window.physicsMaterials.map,
        {
            friction: 0.3,
            restitution: 0.1
        }
    );
    world.addContactMaterial(mapContact);

    if (typeof initCamera === "function") initCamera();

    animate();
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const dt = Math.min((time - lastTime) / 1000, 0.1); 
    lastTime = time;

    if (world) {
        world.step(timeStep, dt, 10);
        
        if (typeof updatePlayerMovement === "function") {
            updatePlayerMovement();
        }

        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            const body = bodies[i];
            
            if (mesh && body) {
                if (body.type !== CANNON.Body.STATIC) {
                    mesh.position.copy(body.position);
                    mesh.quaternion.copy(body.quaternion);
                }
            }
        }
    }

    if (typeof updateCamera === "function") {
        updateCamera();
    }
    
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});