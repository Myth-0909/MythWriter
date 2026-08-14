param(
  [ValidateSet("web", "desktop")]
  [string]$Mode = "web"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $ProjectRoot "document"
$BackendDir = Join-Path $ProjectRoot "server"
$BackendPort = 3000
$FrontendPort = 1420
$Processes = @()

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "缺少命令 / Missing command: $Name"
  }
}

function Assert-PortFree([int]$Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    throw "端口已被占用 / Port is already in use: $Port (PID $($listener.OwningProcess))"
  }
}

Assert-Command "node"
Assert-Command "npm.cmd"
Assert-Command "pnpm.cmd"
if ($Mode -eq "desktop") { Assert-Command "cargo" }
Assert-PortFree $BackendPort
Assert-PortFree $FrontendPort

Write-Host "[数据库/Database] 初始化 / Initializing..."
Push-Location $BackendDir
try {
  & npm.cmd run setup-local
  if ($LASTEXITCODE -ne 0) { throw "数据库初始化失败 / Database setup failed" }
} finally {
  Pop-Location
}

try {
  $env:HOST = "0.0.0.0"
  $env:NODE_USE_ENV_PROXY = if ($env:NODE_USE_ENV_PROXY) { $env:NODE_USE_ENV_PROXY } else { "0" }
  $Processes += Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev:watch") -WorkingDirectory $BackendDir -NoNewWindow -PassThru

  if ($Mode -eq "desktop") {
    Write-Host "[桌面端/Desktop] 启动 / Starting..."
    $Processes += Start-Process -FilePath "pnpm.cmd" -ArgumentList @("tauri", "dev") -WorkingDirectory $FrontendDir -NoNewWindow -PassThru
  } else {
    Write-Host "[网页端/Web] http://localhost:$FrontendPort"
    $env:VITE_DEV_HOST = "0.0.0.0"
    $Processes += Start-Process -FilePath "pnpm.cmd" -ArgumentList @("dev") -WorkingDirectory $FrontendDir -NoNewWindow -PassThru
  }

  Write-Host "[API] http://localhost:$BackendPort/api/health"
  Write-Host "按 Ctrl+C 停止 / Press Ctrl+C to stop"
  while (($Processes | Where-Object { -not $_.HasExited }).Count -eq $Processes.Count) {
    Start-Sleep -Milliseconds 500
  }
  throw "有服务意外退出 / A service exited unexpectedly"
} finally {
  foreach ($process in $Processes) {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
