<?php
session_start();
include 'main/database.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('HTTP/1.1 401 Unauthorized');
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$userId = $_SESSION['user_id'];

// Fetch user info from the 'users' table
$stmt = $conn->prepare("SELECT username, bio, date_created FROM users WHERE id = ?");
$stmt->bind_param("i", $userId);
$stmt->execute();
$result = $stmt->get_result();

if ($user = $result->fetch_assoc()) {
    header('Content-Type: application/json');
    echo json_encode($user);
} else {
    echo json_encode(['error' => 'User not found']);
}
?>