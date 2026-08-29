<?php
ob_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
session_start();

$base_url = "/"; 
require_once 'main/database.php';

$username = '';
$error_message = '';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    
    $username = trim($_POST['username']);
    $password_input = $_POST['password'];
    
    if (empty($username) || empty($password_input)) {
        $error_message = "Please enter both username and password.";
    } else {
        
        $sql = "SELECT id, username, passwordhash FROM Users WHERE username = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 1) {
            
            $user = $result->fetch_assoc();
            $stored_hash = $user['passwordhash'];
            
            if (password_verify($password_input, $stored_hash)) {
                
                $_SESSION['loggedin'] = true;
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                
                // Clear the buffer and go to Home
                ob_end_clean(); 
                header("Location: Home.php");
                exit; 
            } else {
                $error_message = "Invalid username or password.";
            }
        } else {
            $error_message = "Invalid username or password.";
        }
        
        $stmt->close();
    }
}

// Header is included only if no redirect happened
include 'main/header.php'; 
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>User Login</title>
</head>
<body>
<div class="container">
    <h2>User Login</h2>

    <?php if (!empty($error_message)): ?>
        <div class='error' style="color: red;"><?php echo htmlspecialchars($error_message); ?></div>
    <?php endif; ?>

    <form action="Login.php" method="post">
        
        <label for="username">Username:</label>
        <input type="text" id="username" name="username" value="<?php echo htmlspecialchars($username); ?>" required>
        
        <br><br>

        <label for="password">Password:</label>
        <input type="password" id="password" name="password" required>
        
        <br><br>

        <button type="submit">Log In</button>
        <div class="accounthave">
        <p>Dont have an acocunt? Click  
    <a href="<?php echo $base_url; ?>mobile/SignUp.php">Here</a>
        </p>
        </div>
    </form>
</div>
</body>
</html>

<?php
include 'main/footer.php';
ob_end_flush();
?>