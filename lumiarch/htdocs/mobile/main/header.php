<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

require $_SERVER['DOCUMENT_ROOT'] . '/main/database.php';
$user_coins = 0;

if (isset($_SESSION['user_id'])) {
    $user_id = $_SESSION['user_id'];
    $u_sql = "SELECT coins, avatar_data FROM Users WHERE id = ?";
    $u_stmt = $conn->prepare($u_sql);
    $u_stmt->bind_param("i", $user_id);
    $u_stmt->execute();
    $u_res = $u_stmt->get_result()->fetch_assoc();
    
    $user_coins = $u_res['coins'] ?? 0;
}

$protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
$base_url = $protocol . "://" . $_SERVER['HTTP_HOST'] . "/";

function auto_version($url) {
    $path = parse_url($url, PHP_URL_PATH);
    $full_path = $_SERVER['DOCUMENT_ROOT'] . $path;

    if (file_exists($full_path)) {
        return $url . '?v=' . filemtime($full_path);
    }
    return $url;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="apple-touch-icon" href="https://lumisle.rf.gd/images/icon.png">
    <link rel="apple-touch-startup-image" href="<?php echo auto_version($base_url . "images/icon.png"); ?>">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <meta name="apple-mobile-web-app-title" content="Lumisle">
    <script>
    const manifestData = {
        "name": "Lumisle",
        "short_name": "Lumisle",
        "description": "Lumisle, a ROBLOX clone you can play straight from your web browser! Singleplayer fun, Physics fun! What do you want to build? You can build dominoes, falling towers, bowling, buildings, and more!",
        "start_url": "<?php echo $base_url; ?>index",
        "display": "standalone",
        "scope": "/",
        "background_color": "#000000",
        "theme_color": "#000000",
        "icons": [
            {
                "src": "<?php echo $base_url; ?>images/icon.png",
                "sizes": "192x192",
                "type": "image/png"
            },
            {
                "src": "<?php echo $base_url; ?>images/icon.png",
                "sizes": "512x512",
                "type": "image/png"
            }
        ]
    };

    const stringManifest = JSON.stringify(manifestData);
    const blob = new Blob([stringManifest], {type: 'application/json'});
    const manifestURL = URL.createObjectURL(blob);
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = manifestURL;
    document.head.appendChild(manifestLink);

if (("standalone" in window.navigator) && window.navigator.standalone) {
    document.addEventListener('click', function(e) {
        var element = e.target;
        while (element.nodeName !== 'A' && element.nodeName !== 'HTML') {
            element = element.parentNode;
        }
        if ('href' in element && element.href.indexOf('http') !== -1 && 
           (element.href.indexOf(window.location.host) !== -1)) {
            e.preventDefault();
            window.location.href = element.href;
        }
    }, false);
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('<?php echo $base_url; ?>sw.js');
}
</script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/x-icon" href="../images/favicon.ico">
    <title><?php echo $pageTitle ?? 'Galaxia'; ?></title>
    <link rel="stylesheet" href="<?php echo auto_version($base_url . "mobile/main/CSS/style.css"); ?>">
</head>
<body>
<div class="app-container">
    
    <div id="alertbanner" style="background-color: red; width: 100%; left: 0; grid-template-areas: 'stack'; display: grid;">
        <span class="menutext" style="font-size: 14px; white-space: normal; word-break: break-word; padding: 5px;">Note to self: Instead of using the same system as "Game_Client", use a new system for "Game_Studio"</span>
    </div>

<div class="content-wrapper">