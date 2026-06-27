[CmdletBinding()]
param()

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
$excluded = @(
    ".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache",
    ".mypy_cache", "dist", "build", "coverage", "htmlcov", "uploads", "storage",
    "logs", "artifacts", "playwright-report", "test-results"
)

Get-ChildItem -LiteralPath $config.RepoRoot -Recurse -Force |
    Where-Object {
        $relative = $_.FullName.Substring($config.RepoRoot.Length).TrimStart("\")
        foreach ($part in $relative -split "\\") {
            if ($excluded -contains $part) {
                return $false
            }
        }
        return $true
    } |
    Sort-Object FullName |
    ForEach-Object {
        $_.FullName.Substring($config.RepoRoot.Length).TrimStart("\")
    }

