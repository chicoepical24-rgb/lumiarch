/**
 * loadmap.js
 * Fetches map XML from get_game.php and injects it into the engine.
 */
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameid');
    if (gameId) {
        console.log("Galaxia: Fetching Game ID " + gameId);
        fetch(`../get_game.php?id=${gameId}`)
            .then(response => {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.text();
            })
            .then(content => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(content, "text/xml");
                
                const rootNode = xmlDoc.getElementsByTagName("galaxia")[0] || 
                                 xmlDoc.getElementsByTagName("galaxia-game")[0] || 
                                 xmlDoc.documentElement;
                
                if (!content.includes("workspace") && !content.includes("Workspace")) {
                    console.error("Invalid map data received. Check PHP/Database.");
                    return;
                }
                
                // Clear existing environment (preserve player)
                if (typeof meshes !== 'undefined' && typeof bodies !== 'undefined') {
                    for (let i = meshes.length - 1; i >= 0; i--) {
                        if (typeof playerGroup !== 'undefined' && playerGroup.children.includes(meshes[i])) {
                            continue; 
                        }
                        scene.remove(meshes[i]);
                        if (bodies[i] && typeof world !== 'undefined') {
                            world.removeBody(bodies[i]);
                        }
                        meshes.splice(i, 1);
                        bodies.splice(i, 1);
                    }
                    console.log("Environment cleared.");
                }
                
                // Use processElements for all formats
                if (typeof processElements === "function") {
                    processElements(rootNode);
                    console.log("Map loaded successfully. Parts created:", meshes.length);
                } else {
                    console.error("processElements function not available!");
                    return;
                }
                
                // Bake initial connections
                if (typeof bakeInitialConnections === 'function') {
                    bakeInitialConnections();
                }
                
                // Spawn player after a delay
                setTimeout(() => {
                    if (window.characterBody) {
                        window.characterBody.position.set(0, 50, 0); 
                        window.characterBody.velocity.set(0, 0, 0);
                        
                        if (typeof characterParts !== 'undefined') {
                            characterParts.forEach(part => {
                                part.body.position.copy(window.characterBody.position);
                            });
                        }
                        console.log("Player spawned.");
                    }
                }, 800);
            })
            .catch(err => {
                console.error("Galaxia Loader Error:", err);
            });
    }
})();