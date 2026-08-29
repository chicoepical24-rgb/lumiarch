<?php
ini_set('display_errors', 1); 
error_reporting(1);

require_once($_SERVER['DOCUMENT_ROOT'] . '/main/database.php');
session_start();

$default = [
    "head"      => "245, 205, 48",  // Yellow
    "torso"     => "13, 105, 172",  // Blue
    "left_arm"  => "245, 205, 48",  // Yellow
    "right_arm" => "245, 205, 48",  // Yellow
    "left_leg"  => "153, 204, 0",    // Green
    "right_leg" => "153, 204, 0"     // Green
];

$id = isset($_SESSION['user_id']) ? $_SESSION['user_id'] : 0;

$sql = "SELECT avatar_data FROM Users WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();

header('Content-Type: application/json');

if ($row && !empty($row['avatar_data'])) {
    $data = $row['avatar_data'];
    $test = json_decode($data);
    
    if (json_last_error() === JSON_ERROR_NONE) {
        echo $data;
    } else {
        echo json_encode($default);
    }
} else {
    echo json_encode($default);
}
exit();
?>