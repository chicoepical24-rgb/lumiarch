<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$userAgent = $_SERVER['HTTP_USER_AGENT'];
$isMobile = preg_match('/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i', $userAgent);

if ($isMobile && 
    strpos($_SERVER['REQUEST_URI'], '/mobile/') === false && 
    strpos($_SERVER['REQUEST_URI'], '/thumbnails/') === false && 
    strpos($_SERVER['REQUEST_URI'], '/avatar/') === false) {
    
    header("Location: /mobile/index.php");
    exit;
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
    <link rel="icon" type="image/x-icon" href="/images/favicon.ico">
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
    <title><?php echo $pageTitle ?? 'Lumisle'; ?></title>
    <link rel="stylesheet" href="<?php echo auto_version($base_url . "main/CSS/style.css"); ?>">
</head>
<body>

<div id="topbar">
    <div class="logo">
                <a style="display: block; width: 100%; height: 100%;" href="<?php echo $base_url; ?>"></a>
            </div>

    <div class="navigation-links">
        <a class="menubutton" href="<?php echo $base_url; ?>Games">Games</a>
        <a class="menubutton" href="<?php echo $base_url; ?>Catalog">Catalog</a>
        <a class="menubutton" href="<?php echo $base_url; ?>Browse">Browse</a>
        <a class="menubutton" href="<?php echo $base_url; ?>Legacy_Studio/">Legacy Studio</a>
        <a class="menubutton" href="<?php echo $base_url; ?>Game_Studio/">Studio</a>
    </div>
    <?php if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true): ?>
            <div class="Options" >
                <div class="menutext" style="display: flex; align-items: center;">
                    <?php echo $user_coins; ?>
                    <div class="sidebaricon" style="
    -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/Part.svg'); 
    mask-image: url('https://lumisle.rf.gd/images/icons/Part.svg'); background-color: white;
"></div>
                </div>
                <a class="menutext" style="text-decoration: none;" href="<?php echo $base_url; ?>logout" >Logout</a>
            </div>
        <?php else: ?>
            <div class="Options">
                <a class="menutext" style="text-decoration: none;" href="<?php echo $base_url; ?>Login">Login</a>
            </div>
        <?php endif; ?>
</div>
    
    <?php if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true): ?>
    <div id="container">
        <div class="ProfileAvatarWrapper" ><iframe  src="../thumbnails/Render_Head.php?id=<?php echo $_SESSION['user_id']; ?>" width="36" height="36" frameborder="0" class="ProfileAvatarCircle"></iframe>
            <span class="menutext" style="color: black">
                <?php echo htmlspecialchars($_SESSION['username']);?>
            </span></div>
        
        <hr>
        <div class="sidebaritem" style="display: flex; align-items: center; ">
        <a href="/My" class="sidebar-link">
    <div class="sidebaricon" style="
        -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/profile.svg'); 
        mask-image: url('https://lumisle.rf.gd/images/icons/profile.svg');">
    </div>
</a>
    <a class="menubutton" style="color: black" href="<?php echo $base_url; ?>My/">Profile</a>
            </div>
            <div class="sidebaritem" style="display: flex; align-items: center; ">
        <a href="/My/avatar" class="sidebar-link">
    <div class="sidebaricon" style="
        -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/avatar.svg'); 
        mask-image: url('https://lumisle.rf.gd/images/icons/avatar.svg');">
    </div>
</a>
        <a class="menubutton" style="color: black" href="<?php echo $base_url; ?>My/avatar">Avatar</a>
                </div>
     </div>
    <?php else: ?>
    <?php endif; ?>
    
    
    <?php if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true): ?>
<div id="alertbanner" style="background-color: red; width: calc(100% - 200px); ">
   <?php else: ?>
    <div id="alertbanner" style="background-color: red; width: 100%; left: 0;">
    <?php endif; ?>
    <span class="menutext" style="font-size: 14px;">Note to self: Instead of using the same system as "Game_Client", use a new system for "Game_Studio"</span>
</div>

    <?php if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true): ?>
<div class="content-wrapper" style="width: calc(100% - 200px); ">
   <?php else: ?>
    <div class="content-wrapper" style="width: 100%; margin-left: 0;">
    <?php endif; ?>