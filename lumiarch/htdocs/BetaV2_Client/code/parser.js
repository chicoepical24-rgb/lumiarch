function processElements(node) {
    const children = node.children;

    for (let i = 0; i < children.length; i++) {
        const item = children[i];
        const className = item.getAttribute("class");

        if (className === "Part" || className === "SpawnLocation") {
            const props = item.querySelector("properties");
            if (props) {
                const get = (tag) => props.querySelector(tag)?.textContent || "";
                const vec = (s) => {
                    const a = s.split(",").map(v => parseFloat(v.trim()) || 0);
                    return { x: a[0], y: a[1], z: a[2] };
                };

                const surfaceNode = props.querySelector("surface");
                const surfaces = surfaceNode ? {
                    top: surfaceNode.getAttribute("top"),
                    bottom: surfaceNode.getAttribute("bottom"),
                    front: surfaceNode.getAttribute("front"),
                    back: surfaceNode.getAttribute("back"),
                    left: surfaceNode.getAttribute("left"),
                    right: surfaceNode.getAttribute("right")
                } : null;

                const data = {
                    name: get("name"),
                    id: get("unique-id"),
                    type: get("partType") || className,
                    pos: vec(get("position")),
                    rot: vec(get("rotation")),
                    size: vec(get("size")),
                    color: get("color"),
                    anchored: get("anchored") === "true",
                    canCollide: get("cancollide") !== "false",
                    surfaces: surfaces,
                    material: window.physicsMaterials ? window.physicsMaterials.map : null
                };

                if (typeof createPart === "function") createPart(data);
            }
        } else if (className === "Lighting") {
            const props = item.querySelector("properties");
            if (props && scene) {
                const ambientStr = props.querySelector("ambient")?.textContent || "255,255,255";
                const rgb = ambientStr.split(",").map(v => (parseInt(v.trim()) || 0) / 255);
                
                scene.children.forEach(c => {
                    if (c.isAmbientLight) c.color.setRGB(rgb[0], rgb[1], rgb[2]);
                });

                const brightness = parseFloat(props.querySelector("brightness")?.textContent) || 1;
                scene.children.forEach(c => {
                    if (c.isDirectionalLight) c.intensity = (brightness / 100) * 1.5;
                });
            }
        }

        if (item.children.length > 0) {
            processElements(item);
        }
    }
}