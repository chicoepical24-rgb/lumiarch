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
        body, html { margin: 0; padding: 0; overflow: hidden; background: #87CEEB; }
        canvas { display: block; width: 100vw; height: 100vh; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
    <script>
        const xmlString = `<?php echo addslashes($xmlData); ?>`;
        if (!xmlString) { document.body.style.background = "#333"; }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); 
        renderer.setPixelRatio(window.devicePixelRatio); 
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(50, 100, 50); 
        scene.add(sunLight);

        const textureLoader = new THREE.TextureLoader();
        const assetBase = "https://lumisle.rf.gd/thumbnails/assets/";
        
        const textureMap = {
            "Studs": assetBase + "Studs.png",
            "Inlets": assetBase + "Inlets.png",
            "Weld": assetBase + "Weld.png",
            "Smooth": assetBase + "Smooth.png"
        };

        const parts = xmlDoc.getElementsByTagName("item");
        let boundingBox = new THREE.Box3();
        let hasContent = false;

        for (let item of parts) {
            if (item.getAttribute("class") === "Part") {
                const props = item.getElementsByTagName("properties")[0];
                if (!props) continue;

                // Helper to parse "x, y, z" strings
                const parseCSV = (tagName) => {
                    const el = props.getElementsByTagName(tagName)[0];
                    if (!el) return null;
                    const vals = el.textContent.split(',').map(v => parseFloat(v.trim()));
                    return { x: vals[0] || 0, y: vals[1] || 0, z: vals[2] || 0 };
                };

                const pos = parseCSV("position") || { x: 0, y: 0, z: 0 };
                const size = parseCSV("size") || { x: 4, y: 1.2, z: 2 };
                const rot = parseCSV("rotation") || { x: 0, y: 0, z: 0 };
                
                // Color (255, 255, 255)
                const colorEl = props.getElementsByTagName("color")[0];
                let color = "#cccccc";
                if (colorEl) {
                    const rgb = colorEl.textContent.split(',').map(v => v.trim());
                    color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
                }

                // Surface
                const surfNode = props.getElementsByTagName("surface")[0];
                const surfaces = {
                    right: surfNode?.getAttribute("right") || "Smooth",
                    left: surfNode?.getAttribute("left") || "Smooth",
                    top: surfNode?.getAttribute("top") || "Smooth",
                    bottom: surfNode?.getAttribute("bottom") || "Smooth",
                    front: surfNode?.getAttribute("front") || "Smooth",
                    back: surfNode?.getAttribute("back") || "Smooth"
                };

                const materials = [
                    surfaces.right, surfaces.left, surfaces.top, 
                    surfaces.bottom, surfaces.front, surfaces.back
                ].map((s, index) => {
                    const texPath = textureMap[s] || textureMap["Smooth"];
                    const tex = textureLoader.load(texPath);
                    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                    tex.magFilter = tex.minFilter = THREE.NearestFilter;
                    
                    if (index === 0 || index === 1) { 
        tex.repeat.set(size.z / 2, size.y / 4); 
    } else if (index === 2 || index === 3) { 
        tex.repeat.set(size.x / 2, size.z / 4); 
    } else if (index === 4 || index === 5) { 

        tex.repeat.set(size.x / 2, size.y / 4); 
    }

                    return new THREE.MeshStandardMaterial({ color: color, map: tex, roughness: 0.7 });
                });

                const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
                const mesh = new THREE.Mesh(geometry, materials);
                
                mesh.position.set(pos.x, pos.y, pos.z);
                mesh.rotation.set(
                    rot.x * (Math.PI / 180), 
                    rot.y * (Math.PI / 180), 
                    rot.z * (Math.PI / 180)
                );
                
                scene.add(mesh);
                boundingBox.expandByObject(mesh);
                hasContent = true;
            }
        }

        if (hasContent) {
            const center = new THREE.Vector3();
            const bSize = new THREE.Vector3();
            boundingBox.getCenter(center);
            boundingBox.getSize(bSize);

            const maxDim = Math.max(bSize.x, bSize.y, bSize.z);
            const distance = maxDim * 0.5;

            camera.position.set(center.x + distance, center.y + distance, center.z + distance);
            camera.lookAt(center);
        }

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    </script>
</body>
</html>