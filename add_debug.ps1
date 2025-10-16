# PowerShell script to add debugging to habits.js
$file = "routes/habits.js"
$content = Get-Content $file
$newContent = @()

for ($i = 0; $i -lt $content.Length; $i++) {
    $newContent += $content[$i]
    
    # Add debugging after line 118 (try {)
    if ($content[$i] -match "^\s*try\s*{\s*$" -and $i -gt 115 -and $i -lt 125) {
        $newContent += "    console.log('🎯 Creating habit for user:', req.user?.id || 'NO USER');"
        $newContent += "    console.log('📝 Habit data:', { name: req.body.name, category: req.body.category });"
        $newContent += ""
    }
}

$newContent | Set-Content $file
Write-Host "✅ Added debugging to habits.js"
