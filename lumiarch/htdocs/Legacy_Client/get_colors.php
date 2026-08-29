<?php
// Ensure errors don't mix with JSON output
ini_set('display_errors', 0); 
error_reporting(0);

require_once('../main/database.php');
session_start();

$default = [
    "head" => "#f5cd30", 
    "torso" => "#0d69ac", 
    "left_arm" => "#f5cd30", 
    "right_arm" => "#f5cd30", 
    "left_leg" => "#99cc00", 
    "right_leg" => "#99cc00"
];

// CHANGED: Using user_id to match your Bio Editor
if (isset($_SESSION['user_id'])) {
    $id = $_SESSION['user_id'];
} else {
    // If you want a default view for guests, keep this. 
    // Otherwise, you can set $id = 0;
    $id = 1; 
}

$sql = "SELECT avatar_data FROM Users WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();

header('Content-Type: application/json');

if ($row && !empty($row['avatar_data'])) {
    echo $row['avatar_data'];
} else {
    echo json_encode($default);
}
?>