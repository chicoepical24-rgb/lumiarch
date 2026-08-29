<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
$base_url = "/"; 
$pageTitle = "LUMISLE Users"; 

include 'main/header.php';
require_once ('main/database.php');

if ($conn->connect_error) {
    die("<p class='error'>Connection failed: " . $conn->connect_error . "</p>");
}

// Fetch avatar_data along with the other user info
$sql = "SELECT id, username, bio, created, avatar_data FROM Users ORDER BY id DESC";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    echo "<style>
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
        .avatar-cell { width: 60px; text-align: center; }
        iframe.user-thumb { border: none; pointer-events: none; overflow: hidden; }
    </style>";

    echo "<table>";
    echo "<thead><tr><th>Avatar</th><th>ID</th><th>Username</th><th>Bio</th><th>Created At</th></tr></thead>";
    echo "<tbody>";

    while($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td class='avatar-cell'>
                <iframe class='user-thumb' src='thumbnails/Render.php?id=" . $row["id"] . "' width='50' height='50' scrolling='no'></iframe>
              </td>";
        echo "<td>" . $row["id"] . "</td>";
        echo "<td><a class='normala' href='User.php?id=". $row["id"] ."'>" . htmlspecialchars($row["username"]) . "</a></td>";
        echo "<td>" . (empty($row["bio"]) ? "No bio provided" : htmlspecialchars($row["bio"])) . "</td>";
        echo "<td>" . $row["created"] . "</td>";
        echo "</tr>";
    }

    echo "</tbody>";
    echo "</table>";
} else {
    echo "<p>0 results found in the Users table.</p>";
}

$conn->close();
?>

<?php
include 'main/footer.php';
?>