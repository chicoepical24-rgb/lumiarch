<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
session_start();
$base_url = "/"; 
$pageTitle = "Lumisle: An Online Physics Toy"; 


include 'main/header.php';

if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
    header("Location: ../Login.php");
    exit;
}


$username = isset($_SESSION['username']) ? $_SESSION['username'] : "Guest";
$id = isset($_SESSION['user_id']) ? $_SESSION['user_id'] : 0;
?>

<div class="user-profile-card">
    <div class="avatar-column">
        <iframe 
            src="../thumbnails/Render_Head.php?id=<?php echo $id; ?>" 
            width="250" 
            height="250" 
            frameborder="0" 
            scrolling="no">
        </iframe>
    </div>

    <div class="info-column">
        <p class="bigtext">Hello, <?php echo htmlspecialchars($username); ?></p>
        
        <div class="meta-row">
            <span class="id-badge">ID: <?php echo htmlspecialchars($id); ?></span>
            <span class="status-indicator">Online</span>
        </div>
    </div>
</div>

<?php
include 'main/footer.php';
?>