<?php
require_once('../main/database.php');

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;

$sql = "SELECT gamedata FROM Games WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();
$result = $stmt->get_result();
$game = $result->fetch_assoc();
$xmlData = $game['gamedata'] ?? '';
?>
<!DOCTYPE html>
<html>
<head>
    <style>
        body, html { margin: 0; padding: 0; overflow: hidden; background: #87CEEB; font-family: sans-serif; }
        canvas { display: block; width: 100vw; height: 100vh; }
        #loader {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #222; color: white; display: flex;
            align-items: center; justify-content: center; z-index: 10;
            transition: opacity 0.5s ease;
        }
    </style>
    <script type="importmap">
    {
        "imports": {
            "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
            "three/examples/jsm/loaders/OBJLoader.js": "https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js",
            "three/examples/jsm/geometries/DecalGeometry.js": "https://unpkg.com/three@0.160.0/examples/jsm/geometries/DecalGeometry.js"
        }
    }
    </script>
</head>
<body>
    <div id="loader"><h1>Loading...</h1></div>

    <script type="module">
        import * as THREE from 'three';
        import { parseLumisle } from './code/parser.js';
        import { buildWorkspace } from './code/builder.js';

        const xmlString = `<?php echo addslashes($xmlData); ?>`;
        const loaderEl = document.getElementById('loader');

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); 
        renderer.setPixelRatio(window.devicePixelRatio); 
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.body.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(100, 200, 100); 
        sunLight.castShadow = true;
        scene.add(sunLight);

        // Track if we have already performed the "Final" render
        let isDone = false;

        const hideLoading = () => {
            if (isDone) return;
            isDone = true;
            
            frameScene(); // Final positioning and render
            
            loaderEl.style.opacity = '0';
            setTimeout(() => loaderEl.remove(), 500);
        };

        const loadingManager = new THREE.LoadingManager();
        loadingManager.onLoad = () => {
            hideLoading();
        };

        const parsedData = parseLumisle(xmlString);
        buildWorkspace(scene, parsedData, loadingManager);

        function frameScene() {
            const boundingBox = new THREE.Box3();
            let hasContent = false;

            scene.traverse((child) => {
                if (child.isMesh) {
                    boundingBox.expandByObject(child);
                    hasContent = true;
                }
            });

            if (hasContent) {
                const center = new THREE.Vector3();
                boundingBox.getCenter(center);
                const sphere = new THREE.Sphere();
                boundingBox.getBoundingSphere(sphere);
                const radius = sphere.radius;
                const fov = camera.fov * (Math.PI / 180);
                let distance = Math.abs(radius / Math.sin(fov / 2));
                const aspect = camera.aspect;
                if (aspect < 1) distance = distance / aspect;

                const offset = 0.4; 
                camera.position.set(
                    center.x + (distance * offset), 
                    center.y + (distance * offset), 
                    center.z + (distance * offset)
                );
                camera.lookAt(center);
                camera.updateProjectionMatrix();
            } else {
                camera.position.set(20, 20, 20);
                camera.lookAt(0, 0, 0);
            }
            renderer.render(scene, camera);
        }

        // Fallback: If assets take too long or manager fails, show whatever we have after 4s
        setTimeout(hideLoading, 4000);

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            if (isDone) renderer.render(scene, camera);
        });
    </script>
</body>
</html>