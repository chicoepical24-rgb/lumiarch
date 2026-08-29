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
$stmt = $conn->prepare("SELECT * FROM Games WHERE id = ? AND creator_id = ?");
$stmt->bind_param("ii", $game_id, $creator_id);
$stmt->execute();
$result = $stmt->get_result();
$game = $result->fetch_assoc();

if (!$game) {
    die("Game not found or access denied.");
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = $_POST['name'];
    $bio = $_POST['bio'];
    $thumbnail = $_POST['thumbnail'];
    $gamedata = $game['gamedata']; // Default to existing data

    // Handle GLXA or XML file upload for gamedata if a new file is provided
    if (isset($_FILES['game_file']) && $_FILES['game_file']['error'] == 0) {
        $gamedata = file_get_contents($_FILES['game_file']['tmp_name']);
    }

    $update_stmt = $conn->prepare("UPDATE Games SET name = ?, bio = ?, thumbnail = ?, gamedata = ? WHERE id = ? AND creator_id = ?");
    
    if ($update_stmt) {
        $update_stmt->bind_param("ssssii", $name, $bio, $thumbnail, $gamedata, $game_id, $creator_id);
        if ($update_stmt->execute()) {
            header("Location: index.php");
            exit;
        }
    }
}

$pageTitle = "Edit Game";
include '../main/header.php';
?>

<p class="bigtext">Edit Game: <?php echo htmlspecialchars($game['name']); ?></p>

<form method="POST" enctype="multipart/form-data">
    <div class="container">
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Game Name:</label>
            <input type="text" name="name" value="<?php echo htmlspecialchars($game['name']); ?>" required style="width: 100%; border: 1px inset #808080; padding: 2px;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Description (Bio):</label>
            <textarea name="bio" style="width: 100%; height: 80px; border: 1px inset #808080; font-family: Tahoma;"><?php echo htmlspecialchars($game['bio']); ?></textarea>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Thumbnail Link:</label>
            <input type="text" name="thumbnail" value="<?php echo htmlspecialchars($game['thumbnail']); ?>" placeholder="thumbnails/game.png" style="width: 100%; border: 1px inset #808080; padding: 2px;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Update Game Data (.xml, .glxa) <span style="font-size: 10px;">(Leave blank to keep current)</span>:</label>
            <input type="file" name="game_file" accept=".xml,.glxa" style="font-size: 11px;">
        </div>

        <div style="text-align: right; border-top: 1px solid #808080; padding-top: 10px;">
            <button class="button" type="submit" style="padding: 4px 12px; cursor: pointer;">Update Game</button>
            <button class="button" type="button" onclick="window.location.href='index.php'" style="padding: 4px 12px; cursor: pointer;">Cancel</button>
        </div>
    </div>
</form>

<?php 
include '../main/footer.php'; 
ob_end_flush();
?>