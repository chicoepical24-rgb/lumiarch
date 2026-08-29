<?php
ob_start();
session_start();
include '../main/database.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: ../Login.php");
    exit;
}

$creator_id = $_SESSION['user_id'];
$game_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

// Fetch existing game data
$stmt = $conn->prepare("SELECT * FROM Games WHERE id = ?");
$stmt->bind_param("i", $game_id);
$stmt->execute();
$result = $stmt->get_result();
$game = $result->fetch_assoc();

// 403 Check: If game doesn't exist OR you aren't the owner
if (!$game || (int)$game['creator_id'] !== (int)$creator_id) {
    http_response_code(403);
    header("Location: ../index.php"); // Or wherever you want to boot them
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = $_POST['name'];
    $bio = $_POST['bio'];
    $thumbnail = $_POST['thumbnail'];
    $gamedata = $game['gamedata']; 

    // Handle file upload
    if (isset($_FILES['game_file']) && $_FILES['game_file']['error'] == 0) {
        $gamedata = file_get_contents($_FILES['game_file']['tmp_name']);
    }

    $update_stmt = $conn->prepare("UPDATE Games SET name = ?, bio = ?, thumbnail = ?, gamedata = ? WHERE id = ? AND creator_id = ?");
    
    if ($update_stmt) {
        $update_stmt->bind_param("ssssii", $name, $bio, $thumbnail, $gamedata, $game_id, $creator_id);
        if ($update_stmt->execute()) {
            header("Location: ../Place.php?id=" . $game_id);
            exit;
        }
    }
}

$pageTitle = "Edit Game - " . htmlspecialchars($game['name']);
include '../main/header.php';
?>

<div class="profile-container" style="max-width: 600px;">
    <p class="bigtext">Configure Game</p>

    <form method="POST" enctype="multipart/form-data">
        <div class="content-box">
            
            <div style="margin-bottom: 15px;">
                <label class="blackmenutext" style="display: block; margin-bottom: 5px;">Game Name:</label>
                <input type="text" name="name" value="<?php echo htmlspecialchars($game['name']); ?>" required class="input-login">
            </div>

            <div style="margin-bottom: 15px;">
                <label class="blackmenutext" style="display: block; margin-bottom: 5px;">Description:</label>
                <textarea name="bio" class="input-login" style="height: 100px; padding: 5px; font-family: arial;"><?php echo htmlspecialchars($game['bio']); ?></textarea>
            </div>

            <div style="margin-bottom: 15px;">
                <label class="blackmenutext" style="display: block; margin-bottom: 5px;">Thumbnail Path:</label>
                <input type="text" name="thumbnail" value="<?php echo htmlspecialchars($game['thumbnail']); ?>" class="input-login">
            </div>

            <div style="margin-bottom: 15px;">
                <label class="blackmenutext" style="display: block; margin-bottom: 5px;">Update Game File (.xml, .glxa):</label>
                <input type="file" name="game_file" accept=".xml,.glxa" style="font-size: 12px;">
                <p style="font-size: 10px; color: #666; margin-top: 5px;">Leave blank to keep the current world data.</p>
            </div>

            <div style="display: flex; gap: 10px; border-top: 1px solid #ccc; padding-top: 15px;">
                <button class="btn-login" type="submit" style="flex: 1;">Update Game</button>
                <button class="btn-login" type="button" onclick="window.location.href='../Place.php?id=<?php echo $game_id; ?>'" style="flex: 1; background-color: #ddd; border-color: #bbb;">Cancel</button>
            </div>

        </div>
    </form>
</div>

<?php 
include '../main/footer.php'; 
ob_end_flush();
?>