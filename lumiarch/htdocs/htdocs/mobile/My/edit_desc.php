<?php
ob_start();
session_start();
include '../main/database.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: ../Login.php");
    exit;
}
$id = $_SESSION['user_id'];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['new_bio'])) {
    $newBio = $_POST['new_bio'];
    
    // Updated to use "Users" and the correct ID variable
    $updateStmt = $conn->prepare("UPDATE Users SET bio = ? WHERE id = ?");
    
    if ($updateStmt) {
        $updateStmt->bind_param("si", $newBio, $id);
        if ($updateStmt->execute()) {
            header("Location: index.php");
            exit;
        }
    }
}

// Fetch current bio
$currentBio = "";
$fetchStmt = $conn->prepare("SELECT bio FROM Users WHERE id = ?");
if ($fetchStmt) {
    $fetchStmt->bind_param("i", $id);
    $fetchStmt->execute();
    $row = $fetchStmt->get_result()->fetch_assoc();
    $currentBio = $row['bio'] ?? "";
}

$pageTitle = "Edit Description";
include '../main/header.php';
?>


<form method="POST">
    <div style="background: #FFF; border: 1px solid #000; max-width: 600px; margin: 0 auto;">
        <div style="background:  #CFCFCF; border: 1px solid #000; max-width: 600px; margin: 0 auto;">
    <p class="description">Edit Profile</p>
    </div>
        <textarea name="new_bio" style="width: 100%; height: 150px; font-family: Tahoma; border: 1px inset #808080;"><?php echo htmlspecialchars($currentBio); ?></textarea>
        <div style="margin-top: 10px; text-align: right;">
            <button type="submit" class="button" style="padding: 4px 12px; cursor: pointer;">Save</button>
            <button type="button" class="button" onclick="window.location.href='index.php'" style="padding: 4px 12px; cursor: pointer;">Cancel</button>
        </div>
    </div>
</form>

<?php 
include '../main/footer.php'; 
ob_end_flush();
?>