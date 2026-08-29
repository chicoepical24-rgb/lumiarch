
<?php
header("Content-Type: text/html; charset=UTF-8");

require_once($_SERVER['DOCUMENT_ROOT'] . '/main/database.php');
$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
?>


<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Lumisle Render</title>
    <style>
        body, html { 
            margin: 0; 
            padding: 0; 
            overflow: hidden; 
            background: #000; 
            width: 100%;
            height: 100%;
        }
        canvas { 
            display: block; 
            width: 100vw; 
            height: 100vh; 
        }
        #loader {
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%;
            background: #111; 
            color: white; 
            display: flex;
            align-items: center; 
            justify-content: center; 
            z-index: 100;
            font-family: sans-serif;
        }
        #loader.hidden { display: none; }
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
    <div id="loader"><h1>GENERATING RENDER...</h1></div>

    <script type="module">
        import { init } from './code/engine.js';

        const gameId = <?php echo $id; ?>;
        
        init(gameId).then(() => {
            document.getElementById('loader').classList.add('hidden');
            console.log("Render Complete");
        }).catch(err => {
            console.error("Render Error:", err);
            document.getElementById('loader').innerHTML = "<h1>RENDER FAILED</h1>";
        });
    </script>
</body>
</html>