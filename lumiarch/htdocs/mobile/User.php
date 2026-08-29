<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

include './main/database.php';

$userId = isset($_GET['id']) ? intval($_GET['id']) : 0;

$profileUsername = "Unknown User"; 
$created = "N/A";
$bio = "This user hasn't written a bio yet.";

if ($userId > 0) {
    $stmt = $conn->prepare("SELECT username, created, bio FROM Users WHERE id = ?");
    if ($stmt) {
        $stmt->bind_param("i", $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($row = $result->fetch_assoc()) {
            $profileUsername = htmlspecialchars($row['username']);
            $created = htmlspecialchars($row['created']);
            $bio = htmlspecialchars($row['bio'] ?? $bio);
        } else {
            $profileUsername = "User Not Found";
        }
        $stmt->close();
    }
}

$user_games = [];
$game_stmt = $conn->prepare("SELECT id, name FROM Games WHERE creator_id = ? ORDER BY id DESC");
if ($game_stmt) {
    $game_stmt->bind_param("i", $userId);
    $game_stmt->execute();
    $game_result = $game_stmt->get_result();
    while ($game_row = $game_result->fetch_assoc()) {
        $user_games[] = $game_row;
    }
    $game_stmt->close();
}

$pageTitle = "Profile - " . $profileUsername;
include './main/header.php';
?>

<style>
    .profile-container {
        max-width: 950px;
        margin: 20px auto;
    }

    .profile-header {
        background: #fff;
        border: 1px solid #dcdcdc;
        padding: 20px;
        display: flex;
        align-items: center;
        position: relative;
    }

    .header-avatar {
        width: 130px;
        height: 130px;
        border-radius: 50%;
        border: 1px solid #ccc;
        overflow: hidden;
        margin-right: 25px;
    }

    .header-info h1 {
        font-size: 28px;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .section-title {
        font-size: 18px;
        color: #666;
        margin: 20px 0 10px 0;
    }

    .content-box {
        background: #fff;
        border: 1px solid #dcdcdc;
        padding: 15px;
        margin-bottom: 20px;
    }

    .dots-menu {
        position: absolute;
        top: 15px;
        right: 20px;
        color: #999;
        font-size: 20px;
        cursor: pointer;
    }
</style>

<div class="profile-container">
    
    <div class="profile-header">
        <div class="header-avatar">
            <iframe src="../thumbnails/Render.php?id=<?php echo $userId; ?>&type=headshot" width="130" height="130" frameborder="0" scrolling="no"></iframe>
        </div>
        <div class="header-info">
            <h1><?php echo $profileUsername; ?></h1>
        </div>
    </div>

    <h2 class="section-title">About</h2>
    <div class="content-box">
        <p><?php echo $bio; ?></p>
        <p style="font-size: 12px; margin-top: 10px;"><strong>Member Since:</strong> <?php echo $created; ?></p>
    </div>

    <h2 class="section-title">Creations</h2>
    <div class="content-box">
        <?php if (empty($user_games)): ?>
            <p style="font-size: 13px; color: #666;">This user has no games.</p>
        <?php else: ?>
            <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                <?php foreach ($user_games as $game): ?>
                    <div style="width: 150px; text-align: center; border: 1px solid #eee; padding: 5px;">
                        <iframe src="../thumbnails/Game.php?id=<?php echo $game['id']; ?>" style="width: 140px; height: 80px; border: 0;" scrolling="no"></iframe>
                        <div style="font-weight: bold; font-size: 12px; margin-top: 5px;">
                            <a href="../Place.php?id=<?php echo $game['id']; ?>" style="text-decoration: none; color: #00A2FF;"><?php echo htmlspecialchars($game['name']); ?></a>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>

</div>

<?php
include './main/footer.php';
?>