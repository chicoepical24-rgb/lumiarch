<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once('main/database.php');

$pageTitle = "LUMISLE Users";
include 'main/header.php';

if ($conn->connect_error) {
    die("<p class='error'>Connection failed: " . $conn->connect_error . "</p>");
}

$sql = "SELECT id, username, bio, created FROM Users ORDER BY id DESC";
$result = $conn->query($sql);
?>

<link rel="stylesheet" href="/main/CSS/style.css">

<div class="content-wrapper">
    <h2>Users</h2>
    <hr>
    
    <?php if ($result && $result->num_rows > 0): ?>
        <table class="users-table">
            <thead>
                <tr>
                    <th>Avatar</th>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Bio</th>
                    <th>Created At</th>
                </tr>
            </thead>
            <tbody>
                <?php while($row = $result->fetch_assoc()): ?>
                    <tr>
                        <td class="avatar-cell">
                            <iframe class="user-thumb" src="thumbnails/Render.php?id=<?php echo $row['id']; ?>" width="50" height="50" scrolling="no"></iframe>
                        </td>
                        <td><?php echo $row["id"]; ?></td>
                        <td>
                            <a class="normala" href="User.php?id=<?php echo $row['id']; ?>">
                                <?php echo htmlspecialchars($row["username"]); ?>
                            </a>
                        </td>
                        <td><?php echo (empty($row["bio"]) ? "No bio provided" : htmlspecialchars($row["bio"])); ?></td>
                        <td><?php echo $row["created"]; ?></td>
                    </tr>
                <?php endwhile; ?>
            </tbody>
        </table>
    <?php else: ?>
        <p>0 results found in the Users table.</p>
    <?php endif; ?>
</div>

<?php
$conn->close();
include 'main/footer.php';
?>