
</div>
<div id="topbar">

    <div class="navigation-links">
    <a href="<?php echo $base_url; ?>mobile/" class="menubutton" style="
        -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/home.svg'); 
        mask-image: url('https://lumisle.rf.gd/images/icons/home.svg');">
    </a>
    
    <a href="<?php echo $base_url; ?>mobile/Games" class="menubutton" style="
        -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/games.svg'); 
        mask-image: url('https://lumisle.rf.gd/images/icons/games.svg');">
    </a>
    
    <?php if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true): ?>
        <a href="<?php echo $base_url; ?>mobile/My/avatar" class="menubutton" style="
            -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/avatar.svg'); 
            mask-image: url('https://lumisle.rf.gd/images/icons/avatar.svg');">
        </a>
    <?php endif; ?>
    
    <a href="<?php echo $base_url; ?>mobile/Catalog" class="menubutton" style="
        -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/catalog.svg'); 
        mask-image: url('https://lumisle.rf.gd/images/icons/catalog.svg');">
    </a>

    <?php if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true): ?>
        <a href="<?php echo $base_url; ?>mobile/logout" class="menubutton" style="
            -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/logout.svg'); 
            mask-image: url('https://lumisle.rf.gd/images/icons/logout.svg');">
        </a>
    <?php else: ?>
        <a href="<?php echo $base_url; ?>mobile/Login" class="menubutton" style="
            -webkit-mask-image: url('https://lumisle.rf.gd/images/icons/login.svg'); 
            mask-image: url('https://lumisle.rf.gd/images/icons/login.svg');">
        </a>
    <?php endif; ?>
</div>
</div>
</div>
</body>
</html>