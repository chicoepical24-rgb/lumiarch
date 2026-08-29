<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

include './main/database.php';

// Get ID from URL, default to 0 if not present
$userId = isset($_GET['id']) ? intval($_GET['id']) : 0;
// Logged in user's ID
$id = $_SESSION['user_id'] ?? 0;

// Boolean check: Is this MY profile?
$is_me = ($id > 0 && $id === $userId);

// Handle Bio Update (Only if it's my profile)
if ($is_me && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_bio'])) {
    $new_bio = $_POST['bio_text'];
    $update_stmt = $conn->prepare("UPDATE Users SET bio = ? WHERE id = ?");
    if ($update_stmt) {
        $update_stmt->bind_param("si", $new_bio, $id);
        $update_stmt->execute();
        $update_stmt->close();
    }
    header("Location: " . $_SERVER['PHP_SELF'] . "?id=" . $userId);
    exit;
}

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
            $bio = $row['bio'] ?? $bio;
        } else {
            $profileUsername = "User Not Found";
        }
        $stmt->close();
    }
}

// Fetch Creations for this specific profile
$user_games = [];
if ($userId > 0) {
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
}

$pageTitle = "Profile - " . $profileUsername;
include './main/header.php';
?>

<div class="profile-container">
    <div class="profile-header">
        <div class="header-avatar">
            <iframe src="./thumbnails/Render.php?id=<?php echo $userId; ?>&type=headshot" width="130" height="130" frameborder="0" scrolling="no"></iframe>
        </div>
        <div class="header-info">
            <h1><?php echo $profileUsername; ?></h1>
            <?php if ($is_me): ?>
                <a href="create_game" class="tab create-game-btn">Create Game</a>
            <?php endif; ?>
        </div>
    </div>

    <div class="profile-content-layout">
        <div class="profile-column-main">
            <h2 class="section-title">About 
                <?php if ($is_me): ?>
                    <a onclick="document.getElementById('bio-display').style.display='none'; document.getElementById('bio-form').style.display='block';" class="edit-btn">[edit]</a>
                <?php endif; ?>
            </h2>
            
            <div class="content-box">
                <div id="bio-display">
                    <p><?php echo nl2br(htmlspecialchars($bio)); ?></p>
                    <p class="member-since"><strong>Member Since:</strong> <?php echo $created; ?></p>
                </div>

                <?php if ($is_me): ?>
                <div id="bio-form" style="display: none;">
                    <form method="POST">
                        <textarea name="bio_text" class="bio-edit"><?php echo htmlspecialchars($bio); ?></textarea>
                        <div class="bio-actions">
                            <button type="submit" name="update_bio" class="btn-login" style="width: 100px;">Save</button>
                            <button type="button" class="btn-login" style="width: 100px; background-color: #ddd;" onclick="document.getElementById('bio-form').style.display='none'; document.getElementById('bio-display').style.display='block';">Cancel</button>
                        </div>
                    </form>
                </div>
                <?php endif; ?>
            </div>
        </div>

        <div class="profile-column-side">
            <h2 class="section-title">Creations</h2>
            <div class="content-box">
                <?php if (empty($user_games)): ?>
                    <p class="no-games">No games created.</p>
                <?php else: ?>
                    <div class="game-list">
                        <?php foreach ($user_games as $game): ?>
                            <div class="game-card">
                                <iframe src="./thumbnails/Game.php?id=<?php echo $game['id']; ?>" class="game-thumb" scrolling="no"></iframe>
                                <div class="game-title">
                                    <a href="./Place.php?id=<?php echo $game['id']; ?>" class="game-link"><?php echo htmlspecialchars($game['name']); ?></a>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<?php
include './main/footer.php';
?>