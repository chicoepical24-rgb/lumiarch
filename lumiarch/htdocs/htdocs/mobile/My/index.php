<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

include '../main/database.php';

if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
    header("Location: ../Login.php");
    exit;
}

$id = $_SESSION['user_id'] ?? 0;

// Handle Bio Update
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_bio'])) {
    $new_bio = $_POST['bio_text'];
    $update_stmt = $conn->prepare("UPDATE Users SET bio = ? WHERE id = ?");
    if ($update_stmt) {
        $update_stmt->bind_param("si", $new_bio, $id);
        $update_stmt->execute();
        $update_stmt->close();
    }
    header("Location: " . $_SERVER['PHP_SELF']);
    exit;
}

$display_name = "Unknown User"; 
$created = "N/A";
$bio = "This user hasn't written a bio yet.";

$stmt = $conn->prepare("SELECT username, created, bio FROM Users WHERE id = ?");
if ($stmt) {
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($row = $result->fetch_assoc()) {
        $display_name = htmlspecialchars($row['username']);
        $created = htmlspecialchars($row['created']);
        $bio = $row['bio'] ?? $bio; 
    }
}

$pageTitle = "My Profile - " . $display_name;

$user_games = [];
$game_stmt = $conn->prepare("SELECT id, name FROM Games WHERE creator_id = ? ORDER BY id DESC");
if ($game_stmt) {
    $game_stmt->bind_param("i", $id);
    $game_stmt->execute();
    $game_result = $game_stmt->get_result();
    while ($game_row = $game_result->fetch_assoc()) {
        $user_games[] = $game_row;
    }
}

include '../main/header.php';
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
        margin: 0 0 15px 0;
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

    .tab {
        padding: 10px 20px;
        cursor: pointer;
        background: #fff;
        border: 1px solid #dcdcdc;
        display: inline-block;
    }

    .edit-btn {
        font-size: 12px;
        color: #00A2FF;
        cursor: pointer;
        text-decoration: none;
        float: right;
    }

    textarea.bio-edit {
        width: 100%;
        height: 100px;
        margin-bottom: 10px;
        padding: 5px;
        box-sizing: border-box;
    }
</style>

<div class="profile-container">
    
    <div class="profile-header">
        <div class="header-avatar">
            <iframe src="../thumbnails/Render.php?id=<?php echo $id; ?>&type=headshot" width="130" height="130" frameborder="0" scrolling="no"></iframe>
        </div>
        <div class="header-info">
            <h1><?php echo $display_name; ?></h1>
            <a href="create_game" class="tab" style="text-decoration: none; color: inherit;">Create Game</a>
        </div>
    </div>

    <h2 class="section-title">About 
        <a onclick="document.getElementById('bio-display').style.display='none'; document.getElementById('bio-form').style.display='block';" class="edit-btn">[edit]</a>
    </h2>
    
    <div class="content-box">
        <div id="bio-display">
            <p><?php echo nl2br(htmlspecialchars($bio)); ?></p>
            <p style="font-size: 12px; margin-top: 10px;"><strong>Member Since:</strong> <?php echo $created; ?></p>
        </div>

        <div id="bio-form" style="display: none;">
            <form method="POST">
                <textarea name="bio_text" class="bio-edit"><?php echo htmlspecialchars($bio); ?></textarea>
                <button type="submit" name="update_bio">Save</button>
                <button type="button" onclick="document.getElementById('bio-form').style.display='none'; document.getElementById('bio-display').style.display='block';">Cancel</button>
            </form>
        </div>
    </div>

    <h2 class="section-title">Creations</h2>
    <div class="content-box">
        <?php if (empty($user_games)): ?>
            <p style="font-size: 13px; color: #666;">No games created.</p>
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
include '../main/footer.php';
?>