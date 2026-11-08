param([ValidateSet('cpu','nvidia','depth','sam3')][string]$Profile='cpu')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
try {
 $runningService=Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
} catch { $runningService=$null }
if($runningService.service -eq 'trace-sam3'){throw 'Stop the running Trace model service before installing packages. Windows locks loaded Python DLLs.'}
$pythonPath=Join-Path $projectRoot 'server\.venv\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $pythonPath)){
 & py -3.12 -m venv 'server/.venv'
 if($LASTEXITCODE -ne 0){throw 'Install Python 3.12 and run setup again.'}
}
function Run-Pip([string[]]$Packages){
 & $pythonPath -m pip install -c server/constraints-ai.txt @Packages
 if($LASTEXITCODE -ne 0){throw 'Dependency installation failed. See the error above.'}
}
if($Profile -eq 'cpu'){Run-Pip @('torch==2.10.0','torchvision==0.25.0','--index-url','https://download.pytorch.org/whl/cpu')}
if($Profile -eq 'nvidia'){Run-Pip @('torch==2.10.0','torchvision==0.25.0','--index-url','https://download.pytorch.org/whl/cu128')}
Run-Pip @('-r','server/requirements-image.txt')
Run-Pip @('--no-deps','rtmlib==0.0.14')
$env:SAM2_BUILD_CUDA='0'
Run-Pip @('--no-deps','--no-build-isolation','git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4')
if($Profile -eq 'sam3'){
 Run-Pip @('-r','server/requirements-model.txt')
}
if($Profile -eq 'depth'){
 Run-Pip @('--no-deps','git+https://github.com/microsoft/MoGe.git@07444410f1e33f402353b99d6ccd26bd31e469e8','git+https://github.com/EasternJournalist/utils3d.git@3fab839f0be9931dac7c8488eb0e1600c236e183','git+https://github.com/EasternJournalist/pipeline.git@866f059d2a05cde05e4a52211ec5051fd5f276d6')
 # Depth Anything's training/demo dependencies are intentionally excluded; inference needs these only.
 Run-Pip @('omegaconf>=2.3,<3','safetensors>=0.6,<1','addict','plyfile','pillow-heif','moviepy==1.0.3','pycolmap','trimesh','matplotlib','evo')
 Run-Pip @('--no-deps','git+https://github.com/ByteDance-Seed/Depth-Anything-3.git@3d835ec1a5802d64a8b8b15f817a1ab54809bfe4')
}
Write-Host 'Local AI runtime installed. Start npm run server and open Models to download the selected checkpoints.' -ForegroundColor Cyan
