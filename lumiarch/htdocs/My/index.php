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

<div class="profile-container">
    <div class="profile-header">
        <div class="header-avatar">
            <iframe src="../thumbnails/Render.php?id=<?php echo $id; ?>&type=headshot" width="130" height="130" frameborder="0" scrolling="no"></iframe>
        </div>
        <div class="header-info">
            <h1><?php echo $display_name; ?></h1>
            <a href="create_game" class="tab create-game-btn">Create Game</a>
        </div>
    </div>

    <h2 class="section-title">About 
        <a onclick="document.getElementById('bio-display').style.display='none'; document.getElementById('bio-form').style.display='block';" class="edit-btn">[edit]</a>
    </h2>
    
    <div class="content-box">
        <div id="bio-display">
            <p><?php echo nl2br(htmlspecialchars($bio)); ?></p>
            <p class="member-since"><strong>Member Since:</strong> <?php echo $created; ?></p>
        </div>

        <div id="bio-form" style="display: none;">
            <form method="POST">
                <textarea name="bio_text" class="bio-edit"><?php echo htmlspecialchars($bio); ?></textarea>
                <div class="bio-actions">
                    <button type="submit" name="update_bio" class="btn-login" style="width: 100px;">Save</button>
                    <button type="button" class="btn-login" style="width: 100px; background-color: #ddd;" onclick="document.getElementById('bio-form').style.display='none'; document.getElementById('bio-display').style.display='block';">Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <h2 class="section-title">Creations</h2>
    <div class="content-box">
        <?php if (empty($user_games)): ?>
            <p class="no-games">No games created.</p>
        <?php else: ?>
            <div class="game-list">
                <?php foreach ($user_games as $game): ?>
                    <div class="game-card">
                        <iframe src="../thumbnails/Game.php?id=<?php echo $game['id']; ?>" class="game-thumb" scrolling="no"></iframe>
                        <div class="game-title">
                            <a href="../Place.php?id=<?php echo $game['id']; ?>" class="game-link"><?php echo htmlspecialchars($game['name']); ?></a>
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