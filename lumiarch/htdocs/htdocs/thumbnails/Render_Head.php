<?php
require_once('../main/database.php');
session_start();

// Use the same defaults as your second script
$default = [
    "head"      => "245, 205, 48", 
    "torso"     => "13, 105, 172", 
    "left_arm"  => "245, 205, 48", 
    "right_arm" => "245, 205, 48", 
    "left_leg"  => "153, 204, 0",   
    "right_leg" => "153, 204, 0",
    "shirtID"   => "0"
];

// Check session first, fallback to GET, then fallback to 0
$id = $_SESSION['user_id'] ?? ($_GET['id'] ?? 0);

$sql = "SELECT avatar_data FROM Users WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();
$result = $stmt->get_result();
$user = $result->fetch_assoc();

$colors = $default;
if ($user && !empty($user['avatar_data'])) {
    $decoded = json_decode($user['avatar_data'], true);
    if (json_last_error() === JSON_ERROR_NONE) {
        $colors = array_merge($default, $decoded);
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Avatar Render</title>
    <style>
        body, html { margin: 0; padding: 0; overflow: hidden; background: transparent; }
        canvas { display: block; width: 100vw; height: 100vh; }
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
<script type="module">
    import * as THREE from 'three';
    import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
    import { Importer } from './code/importer.js';
    import { applyClothes } from './code/clothes.js';

    const userColors = <?php echo json_encode($colors); ?>;
    
    // Mapping exactly to your JSON keys
    const shirtID = userColors.shirtID || "0";
    const pantsID = userColors.pantsID || "0";
    const tshirtID = userColors.tshirtID || "0"; // Matches "tshirtID" in your JSON

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(5, 10, 7.5);
    scene.add(keyLight);

    async function init() {
        let data = await Importer.load("content/models/character.xml");
        
        const applyDBData = (items) => {
            const list = Array.isArray(items) ? items : [items];
            list.forEach(item => {
                const name = (item.properties.Name || "").toLowerCase().replace(/\s+/g, '');
                
                let dbKey = null;
                if (name.includes("head")) dbKey = "head";
                else if (name.includes("torso")) dbKey = "torso";
                else if (name.includes("leftarm")) dbKey = "left_arm";
                else if (name.includes("rightarm")) dbKey = "right_arm";
                else if (name.includes("leftleg")) dbKey = "left_leg";
                else if (name.includes("rightleg")) dbKey = "right_leg";

                if (dbKey && userColors[dbKey]) {
                    item.properties.Color3 = userColors[dbKey];
                }

                // Inject T-Shirt Decal into the data structure
                if (item.class === "Part" && item.properties.Name === "Torso" && tshirtID !== "0") {
                    if (!item.children) item.children = [];
                    item.children.push({
                        class: "Decal",
                        properties: {
                            Name: "T-Shirt",
                            TexturePath: `../avatar/catalog/tshirt/${tshirtID}.png`,
                            Transparency: "0",
                            Side: "front",
                            Color3: "255, 255, 255",
                            ZIndex: "2" 
                        }
                    });
                }

                if (item.children) applyDBData(item.children);
            });
        };
        applyDBData(data);

        const modelGroup = Importer(scene, data, null);

        // Apply 3D clothing wraps (Shirt #6, Pants #1)
        applyClothes(modelGroup, shirtID, pantsID);

        // Camera Logic
        const box = new THREE.Box3().setFromObject(modelGroup);
        const center = box.getCenter(new THREE.Vector3());
        const boxSize = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
        
        camera.position.set(center.x + (maxDim * 0.3), center.y + (maxDim * 0.4), center.z + (maxDim * 0.75));
        camera.lookAt(center.x, center.y + (maxDim * 0.3), center.z);

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();
    }

    init();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
</script>
</body>
</html>