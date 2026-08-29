<?php
ob_start();
session_start();
include '../main/database.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: ../Login.php");
    exit;
}

$creator_id = $_SESSION['user_id'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = $_POST['name'];
    $bio = $_POST['bio'];
    $thumbnail = $_POST['thumbnail'];
    $gamedata = "";

    // Handle GLXA or XML file upload for gamedata
    if (isset($_FILES['game_file']) && $_FILES['game_file']['error'] == 0) {
        $gamedata = file_get_contents($_FILES['game_file']['tmp_name']);
    }

    $stmt = $conn->prepare("INSERT INTO Games (name, bio, thumbnail, gamedata, creator_id) VALUES (?, ?, ?, ?, ?)");
    
    if ($stmt) {
        $stmt->bind_param("ssssi", $name, $bio, $thumbnail, $gamedata, $creator_id);
        if ($stmt->execute()) {
            header("Location: index.php");
            exit;
        }
    }
}

$pageTitle = "Create Game";
include '../main/header.php';
?>

<p class="bigtext">Create New Game</p>

<form method="POST" enctype="multipart/form-data">
    <div class="container">
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Game Name:</label>
            <input type="text" name="name" required style="width: 100%; border: 1px inset #808080; padding: 2px;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Description (Bio):</label>
            <textarea name="bio" style="width: 100%; height: 80px; border: 1px inset #808080; font-family: Tahoma;"></textarea>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Thumbnail Link:</label>
            <input type="text" name="thumbnail" placeholder="thumbnails/game.png" style="width: 100%; border: 1px inset #808080; padding: 2px;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">Upload Game Data (.xml, .glxa):</label>
            <input type="file" name="game_file" accept=".xml,.glxa" style="font-size: 11px;">
        </div>

        <div style="text-align: right; border-top: 1px solid #808080; padding-top: 10px;">
            <button class="button" type="submit" style="padding: 4px 12px; cursor: pointer;">Create Game</button>
            <button class="button" type="button" onclick="window.location.href='index.php'" style="padding: 4px 12px; cursor: pointer;">Cancel</button>
        </div>
    </div>
</form>

<?php 
include '../main/footer.php'; 
ob_end_flush();
?>