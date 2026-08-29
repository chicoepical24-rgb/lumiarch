<?php
        ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
include 'main/header.php';
require_once 'main/database.php'; 

$username = $bio = '';
$error_message = '';
$success_message = '';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    
    $username = trim($_POST['username']);
    $password_input = $_POST['password'];
    $bio = trim($_POST['bio']); 
    
    if (empty($username) || empty($password_input)) {
        $error_message = "Username and Password are required fields.";
    } elseif (strlen($password_input) < 8) {
        $error_message = "Password must be at least 8 characters long.";
    } else {
        $check_sql = "SELECT id FROM Users WHERE username = ?";
        $stmt = $conn->prepare($check_sql);
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $stmt->store_result();
        
        if ($stmt->num_rows > 0) {
            $error_message = "That username is already taken. Please choose another.";
        } else {
            
            $passwordhash = password_hash($password_input, PASSWORD_BCRYPT);
            
            $insert_sql = "INSERT INTO Users (username, passwordhash, bio) VALUES (?, ?, ?)";
            
            $stmt = $conn->prepare($insert_sql);
            
            $stmt->bind_param("sss", $username, $passwordhash, $bio);
            
            if ($stmt->execute()) {
                $success_message = "Welcome, " . htmlspecialchars($username) . ".";
                $username = $bio = '';
            } else {
                $error_message = "Error: Could not register user. " . $stmt->error;
            }
        }
        
        $stmt->close();
    }
}
?>

<div class="login-container">
    <h2>Create a Lumisle account</h2>

    <?php 
    if (!empty($error_message)) {
        echo "<div class='error'>" . htmlspecialchars($error_message) . "</div>";
    } elseif (!empty($success_message)) {
        echo "<div class='success'>" . htmlspecialchars($success_message) . "</div>";
    }
    ?>

    <form action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" method="post">
        
        <input class="input-login" type="text" id="username" name="username" placeholder="Username" required>
        
        <br><br>

        <input class="input-login" type="password" id="password" name="password" placeholder="Password" required>
        
        <br><br>

        <button class="btn-login" type="submit">Sign Up</button>
    </form>
    <div class="accounthave">
        <p>Already have an account? 
    <a class="blackmenutext" style="font-weight: bold" href="<?php echo $base_url; ?>Login.php">Log In</a>
        </p>
        </div>
</div>

</body>
</html>

<?php include 'main/footer.php'; ?>